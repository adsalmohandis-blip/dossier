"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const state = require("../src/state");
const { test, cli, json, withTempRepo, writeFile } = require("./helpers");

function zephyrProject(root) {
  writeFile(root, "prj.conf", "CONFIG_MAIN=y\n");
  writeFile(root, "west.yml", "manifest: {}\n");
  writeFile(root, "reports/cppcheck.xml", '<?xml version="1.0"?><results></results>\n');
  writeFile(root, "reports/lcov.info", "LF:100\nLH:85\nend_of_record\n");
}

test("init detects the toolchain and creates state", () => {
  withTempRepo((root) => {
    zephyrProject(root);
    const result = json(cli(["init", "--json"], root));
    assert.strictEqual(result.initialized, true);
    assert.strictEqual(result.toolchain, "zephyr");
    assert.ok(fs.existsSync(state.eventsPath(root)));
    assert.ok(fs.existsSync(state.configPath(root)));
    assert.strictEqual(state.readEvents(root).length, 1);
  });
});

test("init refuses to run twice", () => {
  withTempRepo((root) => {
    zephyrProject(root);
    cli(["init"], root);
    const result = cli(["init"], root);
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.stderr, /Already a Dossier workspace/);
  });
});

test("commands refuse to run before init", () => {
  withTempRepo((root) => {
    const result = cli(["status"], root);
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.stderr, /Run `dossier init` first/);
  });
});

test("a task must be started before it can be recorded", () => {
  withTempRepo((root) => {
    zephyrProject(root);
    cli(["init"], root);
    const result = cli(["task", "end", "T-9"], root);
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.stderr, /was never started/);
  });
});

test("a task records the model that wrote the change", () => {
  withTempRepo((root) => {
    zephyrProject(root);
    cli(["init"], root);
    cli(["task", "start", "T-1", "--title=add sensor read", "--model=claude-opus-5", "--provider=anthropic"], root);
    const ended = json(cli(["task", "end", "T-1", "--files=src/sensor.c,src/sensor.h", "--json"], root));
    assert.strictEqual(ended.recorded, "change");
    assert.deepStrictEqual(ended.files, ["src/sensor.c", "src/sensor.h"]);

    const change = state.readEvents(root).find((event) => event.type === "change");
    assert.strictEqual(change.payload.model, "claude-opus-5");
    assert.strictEqual(change.payload.provider, "anthropic");
  });
});

test("an ADR records context, decision and status", () => {
  withTempRepo((root) => {
    zephyrProject(root);
    cli(["init"], root);
    const added = json(cli([
      "adr", "add", "--id=ADR-001", "--title=Use CAN over UART",
      "--context=two buses available", "--decision=use CAN",
      "--consequences=needs transceiver,higher cost", "--status=accepted", "--json"
    ], root));
    assert.strictEqual(added.id, "ADR-001");
    assert.strictEqual(added.status, "accepted");
    assert.deepStrictEqual(added.consequences, ["needs transceiver", "higher cost"]);

    const listed = json(cli(["adr", "list", "--json"], root));
    assert.strictEqual(listed.length, 1);
  });
});

test("an invalid ADR status is rejected", () => {
  withTempRepo((root) => {
    zephyrProject(root);
    cli(["init"], root);
    const result = cli(["adr", "add", "--id=ADR-002", "--title=t", "--context=c", "--decision=d", "--status=maybe"], root);
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.stderr, /Invalid --status/);
  });
});

test("an approval must name a person", () => {
  withTempRepo((root) => {
    zephyrProject(root);
    cli(["init"], root);
    const result = cli(["approve"], root);
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.stderr, /must name a person/);
  });
});

test("gate run reports each gate and exits non-zero when blocked", () => {
  withTempRepo((root) => {
    zephyrProject(root);
    cli(["init"], root);
    const blocked = cli(["gate", "run", "--json"], root);
    assert.strictEqual(blocked.exitCode, 1);
    assert.strictEqual(json(blocked).summary.passed, false);

    cli(["approve", "--actor=eng.lead"], root);
    const passing = cli(["gate", "run", "--json"], root);
    assert.strictEqual(passing.exitCode, 0);
    assert.strictEqual(json(passing).summary.passed, true);
  });
});

test("bundle writes json and markdown and records the hash", () => {
  withTempRepo((root) => {
    zephyrProject(root);
    cli(["init"], root);
    cli(["task", "start", "T-1", "--title=add sensor read", "--model=claude-opus-5"], root);
    cli(["task", "end", "T-1", "--files=src/sensor.c"], root);
    cli(["adr", "add", "--id=ADR-001", "--title=Use CAN", "--context=c", "--decision=d"], root);
    cli(["approve", "--actor=eng.lead", "--release=v1.0.0"], root);

    const built = json(cli(["bundle", "--release=v1.0.0", "--json"], root));
    assert.strictEqual(built.release, "v1.0.0");
    assert.strictEqual(built.bundle_hash.length, 64);
    assert.ok(fs.existsSync(built.json));
    assert.ok(fs.existsSync(built.markdown));

    const parsed = JSON.parse(fs.readFileSync(built.json, "utf8"));
    assert.strictEqual(parsed.schema, "dossier.evidence/v0");
    assert.strictEqual(parsed.changes.length, 1);
    assert.strictEqual(parsed.decisions.length, 1);
    assert.strictEqual(parsed.approvals.length, 1);

    const markdown = fs.readFileSync(built.markdown, "utf8");
    assert.match(markdown, /# Evidence bundle — v1\.0\.0/);
    assert.match(markdown, /human_approval/);
  });
});

test("bundle requires a release name", () => {
  withTempRepo((root) => {
    zephyrProject(root);
    cli(["init"], root);
    cli(["approve", "--actor=eng.lead"], root);
    const result = cli(["bundle"], root);
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.stderr, /Missing --release/);
  });
});

test("approvals for another release do not satisfy this one", () => {
  withTempRepo((root) => {
    zephyrProject(root);
    cli(["init"], root);
    cli(["approve", "--actor=eng.lead", "--release=v1.0.0"], root);
    const result = cli(["bundle", "--release=v2.0.0"], root);
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.stderr, /human_approval/);
  });
});

test("status reports the chain as intact", () => {
  withTempRepo((root) => {
    zephyrProject(root);
    cli(["init"], root);
    const status = json(cli(["status", "--json"], root));
    assert.strictEqual(status.chain.ok, true);
    assert.strictEqual(status.toolchain.id, "zephyr");
  });
});

test("doctor runs before init without throwing", () => {
  withTempRepo((root) => {
    const result = json(cli(["doctor", "--json"], root));
    assert.strictEqual(Array.isArray(result.checks), true);
    assert.strictEqual(result.checks.some((item) => item.check === "workspace_initialized"), true);
  });
});

test("an unknown command exits non-zero with a hint", () => {
  withTempRepo((root) => {
    const result = cli(["frobnicate"], root);
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.stderr, /Unknown command/);
  });
});

test("platformio projects are detected too", () => {
  withTempRepo((root) => {
    writeFile(root, "platformio.ini", "[env:esp32]\nplatform = espressif32\n");
    const result = json(cli(["init", "--json"], root));
    assert.strictEqual(result.toolchain, "platformio");
  });
});

test("state stays inside the project directory", () => {
  withTempRepo((root) => {
    zephyrProject(root);
    cli(["init"], root);
    cli(["approve", "--actor=eng.lead", "--release=v1.0.0"], root);
    const built = json(cli(["bundle", "--release=v1.0.0", "--json"], root));
    assert.ok(path.resolve(built.json).startsWith(path.resolve(root)), "bundles must be written inside the project");
  });
});
