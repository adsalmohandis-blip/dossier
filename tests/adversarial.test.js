"use strict";

// These tests are the product promise. If one of them stops failing the
// tamper it is meant to catch, Dossier is lying to an assessor.

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const state = require("../src/state");
const bundleLib = require("../src/bundle");
const { test, cli, json, withTempRepo, writeFile } = require("./helpers");

function cleanProject(root) {
  writeFile(root, "prj.conf", "CONFIG_MAIN=y\n");
  writeFile(root, "west.yml", "manifest: {}\n");
  writeFile(root, "reports/cppcheck.xml", '<?xml version="1.0"?><results></results>\n');
  writeFile(root, "reports/lcov.info", "LF:100\nLH:90\nend_of_record\n");
}

test("changing one byte of a bundle breaks verification", () => {
  withTempRepo((root) => {
    cleanProject(root);
    cli(["init"], root);
    cli(["approve", "--actor=eng.lead", "--release=v1.0.0"], root);
    const built = json(cli(["bundle", "--release=v1.0.0", "--json"], root));

    const file = built.json;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.strictEqual(bundleLib.verify(parsed).ok, true, "untouched bundle must verify");

    parsed.release = "v1.0.1";
    fs.writeFileSync(file, JSON.stringify(parsed, null, 2), "utf8");

    const result = cli(["verify", file, "--json"], root);
    assert.strictEqual(json(result).verified, false);
    assert.strictEqual(result.exitCode, 1);
  });
});

test("a bundle is refused while a gate is failing", () => {
  withTempRepo((root) => {
    cleanProject(root);
    writeFile(root, "reports/lcov.info", "LF:100\nLH:10\nend_of_record\n"); // 10% coverage
    cli(["init"], root);
    cli(["approve", "--actor=eng.lead", "--release=v1.0.0"], root);

    const result = cli(["bundle", "--release=v1.0.0"], root);
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.stderr, /Refusing to build a bundle/);
    assert.match(result.stderr, /coverage/);
  });
});

test("a bundle is refused when no human approved", () => {
  withTempRepo((root) => {
    cleanProject(root);
    cli(["init"], root);
    const result = cli(["bundle", "--release=v1.0.0"], root);
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.stderr, /human_approval/);
  });
});

test("rewriting an event in the log is detected", () => {
  withTempRepo((root) => {
    cleanProject(root);
    cli(["init"], root);
    cli(["adr", "add", "--id=ADR-001", "--title=Use CAN", "--context=c", "--decision=d"], root);
    cli(["approve", "--actor=eng.lead"], root);

    const file = state.eventsPath(root);
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    const forged = JSON.parse(lines[1]);
    forged.payload.decision = "something else entirely";
    lines[1] = JSON.stringify(forged);
    fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");

    const chain = state.verifyChain(state.readEvents(root));
    assert.strictEqual(chain.ok, false);
    assert.strictEqual(chain.broken_at, 2);

    const result = cli(["bundle", "--release=v1.0.0"], root);
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.stderr, /event log is broken/);
  });
});

test("deleting an event from the middle of the log is detected", () => {
  withTempRepo((root) => {
    cleanProject(root);
    cli(["init"], root);
    cli(["adr", "add", "--id=ADR-001", "--title=A", "--context=c", "--decision=d"], root);
    cli(["adr", "add", "--id=ADR-002", "--title=B", "--context=c", "--decision=d"], root);

    const file = state.eventsPath(root);
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    lines.splice(1, 1);
    fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");

    assert.strictEqual(state.verifyChain(state.readEvents(root)).ok, false);
  });
});

test("the same inputs always produce the same bundle hash", () => {
  withTempRepo((root) => {
    cleanProject(root);
    cli(["init"], root);
    cli(["approve", "--actor=eng.lead", "--release=v1.0.0"], root);
    const at = "2026-11-20T00:00:00.000Z";
    const a = bundleLib.build(root, { release: "v1.0.0", at });
    const b = bundleLib.build(root, { release: "v1.0.0", at });
    assert.strictEqual(a.bundle_hash, b.bundle_hash);
  });
});

test("a bundle written to disk is still verifiable after being moved", () => {
  withTempRepo((root) => {
    cleanProject(root);
    cli(["init"], root);
    cli(["approve", "--actor=eng.lead", "--release=v2.0.0"], root);
    const built = json(cli(["bundle", "--release=v2.0.0", "--json"], root));
    const moved = path.join(root, "handed-to-assessor.json");
    fs.copyFileSync(built.json, moved);
    assert.strictEqual(json(cli(["verify", moved, "--json"], root)).verified, true);
  });
});
