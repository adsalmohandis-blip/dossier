"use strict";

// The report exists so we can learn something without breaking the promise the
// whole product rests on. These tests guard that promise: they build a report
// from a workspace stuffed with identifying detail and assert that none of it
// comes out.

const fs = require("fs");
const path = require("path");
const state = require("../src/state");
const report = require("../src/report");
const { test, cli, withTempRepo } = require("./helpers");

const SECRETS = [
  "Northwind Sensors GmbH", "NW-TH-220", "thermostat",
  "v2.3.1", "nadia.kessler", "marco.ferrara",
  "src/radio.c", "src/crypto/keys.c", "include/secret_config.h",
  "Drop the watchdog to 2 s", "ADR-003",
  "reports/cppcheck.xml", "reports/lcov.info",
  "81.4", "97.2"
];

function seed(root) {
  cli(["init"], root);
  state.writeConfig(root, {
    project: { name: "Northwind thermostat", part_number: "NW-TH-220" },
    toolchain: { zephyr: "4.5.0" },
    gates: {
      static_analysis: { tool: "cppcheck", report: "reports/cppcheck.xml", max_errors: 0, enabled: true },
      coverage: { tool: "lcov", report: "reports/lcov.info", min_percent: 70, enabled: true },
      binary_size: { artifact: "", max_bytes: 262144, enabled: false },
      human_approval: { required: true, enabled: true }
    }
  });
  state.appendEvent(root, "task_start", { task: "T-7", title: "Rotate the radio key", model: "claude-opus-5" });
  state.appendEvent(root, "change", {
    task: "T-7", model: "claude-opus-5", provider: "anthropic",
    files: ["src/radio.c", "src/crypto/keys.c", "include/secret_config.h"]
  });
  state.appendEvent(root, "adr", {
    id: "ADR-003", title: "Drop the watchdog to 2 s", status: "accepted",
    context: "The radio window overruns the current watchdog.", decision: "Halve it."
  });
  state.appendEvent(root, "approval", { actor: "nadia.kessler", scope: "release", release: "v2.3.1" });
  state.appendEvent(root, "gate_run", {
    results: [
      { gate: "static_analysis", status: "passed", measured: 0, threshold: 0 },
      { gate: "coverage", status: "passed", measured: 81.4, threshold: 70 },
      { gate: "binary_size", status: "skipped", reason: "disabled in config" },
      { gate: "human_approval", status: "passed" }
    ],
    summary: { passed: true, failed_gates: [], blocking_reason: null }
  });
  state.appendEvent(root, "bundle", { release: "v2.3.1", bundle_hash: "c".repeat(64) });
}

test("a report leaks nothing that identifies a company, a product or a person", () => {
  withTempRepo((root) => {
    seed(root);
    const text = JSON.stringify(report.build(root, { version: "0.1.0" }));
    for (const secret of SECRETS) {
      if (text.includes(secret)) throw new Error(`report leaked "${secret}"`);
    }
  });
});

test("the explanation shown to the person leaks nothing either", () => {
  withTempRepo((root) => {
    seed(root);
    const text = report.explain(report.build(root, { version: "0.1.0" }));
    for (const secret of SECRETS) {
      if (text.includes(secret)) throw new Error(`explanation leaked "${secret}"`);
    }
  });
});

test("a report carries no hashes", () => {
  withTempRepo((root) => {
    seed(root);
    const text = JSON.stringify(report.build(root, {}));
    if (/[0-9a-f]{32,}/.test(text)) throw new Error("report contains something that looks like a hash");
  });
});

test("a new field in the event log cannot reach a report", () => {
  withTempRepo((root) => {
    seed(root);
    // A future version of Dossier records something nobody reviewed.
    state.appendEvent(root, "task_start", {
      task: "T-8", model: "claude-opus-5",
      customer_email: "procurement@northwind.example",
      internal_ticket_url: "https://jira.northwind.example/NW-9981"
    });
    const text = JSON.stringify(report.build(root, {}));
    if (text.includes("northwind.example")) throw new Error("an unreviewed payload field reached the report");
  });
});

test("it counts what we actually want to learn", () => {
  withTempRepo((root) => {
    seed(root);
    const built = report.build(root, { version: "0.1.0" });
    if (built.counts.decisions !== 1) throw new Error(`decisions ${built.counts.decisions}`);
    if (built.counts.approvals !== 1) throw new Error(`approvals ${built.counts.approvals}`);
    if (built.counts.bundles !== 1) throw new Error(`bundles ${built.counts.bundles}`);
    if (built.gates.passed !== 3) throw new Error(`passed ${built.gates.passed}`);
    if (built.gates.skipped !== 1) throw new Error(`skipped ${built.gates.skipped}`);
    if (built.gates.skipped_because.disabled !== 1) throw new Error("skip reason not categorised");
    if (!built.models_used.includes("claude-opus-5")) throw new Error("model not recorded");
    if (built.chain_intact !== true) throw new Error("chain reported broken");
  });
});

test("the command sends nothing", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "report.js"), "utf8");
  for (const forbidden of ["http", "fetch(", "net.", "dns.", "https"]) {
    if (source.includes(forbidden)) throw new Error(`report.js references ${forbidden}`);
  }
});
