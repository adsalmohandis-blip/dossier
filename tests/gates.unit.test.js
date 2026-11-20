"use strict";

const assert = require("assert");

const gates = require("../src/gates");
const { test, withTempRepo, writeFile } = require("./helpers");

test("cppcheck findings are counted from the report", () => {
  assert.strictEqual(gates.countCppcheckErrors('<results></results>'), 0);
  assert.strictEqual(
    gates.countCppcheckErrors('<results><error id="a"/><error id="b"/></results>'),
    2
  );
});

test("lcov percentage is computed from LF and LH", () => {
  assert.strictEqual(gates.lcovPercent("LF:200\nLH:150\n"), 75);
  assert.strictEqual(gates.lcovPercent("LF:0\nLH:0\n"), null);
});

test("a missing report skips the gate instead of passing it", () => {
  withTempRepo((root) => {
    const result = gates.runStaticAnalysis(root, { report: "reports/nope.xml", max_errors: 0, enabled: true });
    assert.strictEqual(result.status, "skipped");
    assert.match(result.reason, /report not found/);
  });
});

test("static analysis fails when findings exceed the limit", () => {
  withTempRepo((root) => {
    writeFile(root, "reports/cppcheck.xml", '<results><error id="a"/><error id="b"/></results>');
    const result = gates.runStaticAnalysis(root, { report: "reports/cppcheck.xml", max_errors: 1, enabled: true });
    assert.strictEqual(result.status, "failed");
    assert.strictEqual(result.measured, 2);
    assert.strictEqual(result.threshold, 1);
  });
});

test("coverage fails below the minimum and passes at or above it", () => {
  withTempRepo((root) => {
    writeFile(root, "reports/lcov.info", "LF:100\nLH:69\n");
    assert.strictEqual(gates.runCoverage(root, { report: "reports/lcov.info", min_percent: 70, enabled: true }).status, "failed");
    writeFile(root, "reports/lcov.info", "LF:100\nLH:70\n");
    assert.strictEqual(gates.runCoverage(root, { report: "reports/lcov.info", min_percent: 70, enabled: true }).status, "passed");
  });
});

test("binary size compares the real artifact size", () => {
  withTempRepo((root) => {
    writeFile(root, "build/app.bin", "x".repeat(1024));
    assert.strictEqual(gates.runBinarySize(root, { artifact: "build/app.bin", max_bytes: 2048, enabled: true }).status, "passed");
    assert.strictEqual(gates.runBinarySize(root, { artifact: "build/app.bin", max_bytes: 512, enabled: true }).status, "failed");
  });
});

test("human approval fails with no approvals and passes with one", () => {
  assert.strictEqual(gates.runHumanApproval({ required: true, enabled: true }, []).status, "failed");
  assert.strictEqual(gates.runHumanApproval({ required: true, enabled: true }, [{}]).status, "passed");
});

test("the summary names every failing gate", () => {
  const summary = gates.summarize([
    { gate: "coverage", status: "failed", reason: "too low" },
    { gate: "binary_size", status: "passed", reason: null },
    { gate: "human_approval", status: "failed", reason: "nobody approved" }
  ]);
  assert.strictEqual(summary.passed, false);
  assert.deepStrictEqual(summary.failed_gates, ["coverage", "human_approval"]);
  assert.match(summary.blocking_reason, /coverage: too low/);
  assert.match(summary.blocking_reason, /human_approval: nobody approved/);
});
