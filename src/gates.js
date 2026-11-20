"use strict";

// Gates read results produced by tools the team already uses.
// Dossier never re-implements static analysis, coverage or SBOM generation.

const fs = require("fs");
const path = require("path");

const DEFAULT_GATES = {
  static_analysis: { tool: "cppcheck", report: "reports/cppcheck.xml", max_errors: 0, enabled: true },
  coverage: { tool: "lcov", report: "reports/lcov.info", min_percent: 70, enabled: true },
  binary_size: { artifact: "", max_bytes: 262144, enabled: false },
  human_approval: { required: true, enabled: true }
};

function countCppcheckErrors(xml) {
  const matches = xml.match(/<error\b/g);
  return matches ? matches.length : 0;
}

function lcovPercent(text) {
  let found = 0;
  let hit = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("LF:")) found += Number(line.slice(3)) || 0;
    if (line.startsWith("LH:")) hit += Number(line.slice(3)) || 0;
  }
  if (found === 0) return null;
  return Math.round((hit / found) * 1000) / 10;
}

function skipped(name, reason) {
  return { gate: name, status: "skipped", reason, measured: null, threshold: null };
}

function runStaticAnalysis(root, config) {
  if (!config || config.enabled === false) return skipped("static_analysis", "disabled in config");
  const file = path.join(root, config.report || "");
  if (!config.report || !fs.existsSync(file)) {
    return skipped("static_analysis", `report not found: ${config.report || "(unset)"}`);
  }
  const errors = countCppcheckErrors(fs.readFileSync(file, "utf8"));
  const max = Number(config.max_errors || 0);
  return {
    gate: "static_analysis",
    status: errors <= max ? "passed" : "failed",
    reason: errors <= max ? null : `${errors} findings exceed the limit of ${max}`,
    measured: errors,
    threshold: max
  };
}

function runCoverage(root, config) {
  if (!config || config.enabled === false) return skipped("coverage", "disabled in config");
  const file = path.join(root, config.report || "");
  if (!config.report || !fs.existsSync(file)) {
    return skipped("coverage", `report not found: ${config.report || "(unset)"}`);
  }
  const percent = lcovPercent(fs.readFileSync(file, "utf8"));
  if (percent === null) return skipped("coverage", "report contains no line data");
  const min = Number(config.min_percent || 0);
  return {
    gate: "coverage",
    status: percent >= min ? "passed" : "failed",
    reason: percent >= min ? null : `coverage ${percent}% is below the minimum of ${min}%`,
    measured: percent,
    threshold: min
  };
}

function runBinarySize(root, config) {
  if (!config || config.enabled === false) return skipped("binary_size", "disabled in config");
  const file = path.join(root, config.artifact || "");
  if (!config.artifact || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return skipped("binary_size", `artifact not found: ${config.artifact || "(unset)"}`);
  }
  const bytes = fs.statSync(file).size;
  const max = Number(config.max_bytes || 0);
  return {
    gate: "binary_size",
    status: bytes <= max ? "passed" : "failed",
    reason: bytes <= max ? null : `binary is ${bytes} bytes, limit is ${max}`,
    measured: bytes,
    threshold: max
  };
}

function runHumanApproval(config, approvals) {
  if (!config || config.enabled === false || config.required === false) {
    return skipped("human_approval", "not required by config");
  }
  const count = (approvals || []).length;
  return {
    gate: "human_approval",
    status: count > 0 ? "passed" : "failed",
    reason: count > 0 ? null : "no human approval recorded for this release",
    measured: count,
    threshold: 1
  };
}

function runAll(root, gatesConfig, approvals) {
  const config = gatesConfig || DEFAULT_GATES;
  return [
    runStaticAnalysis(root, config.static_analysis),
    runCoverage(root, config.coverage),
    runBinarySize(root, config.binary_size),
    runHumanApproval(config.human_approval, approvals)
  ];
}

function summarize(results) {
  const failed = results.filter((item) => item.status === "failed");
  return {
    passed: failed.length === 0,
    failed_gates: failed.map((item) => item.gate),
    blocking_reason: failed.length === 0 ? null : failed.map((item) => `${item.gate}: ${item.reason}`).join(" | ")
  };
}

module.exports = {
  DEFAULT_GATES,
  countCppcheckErrors,
  lcovPercent,
  runStaticAnalysis,
  runCoverage,
  runBinarySize,
  runHumanApproval,
  runAll,
  summarize
};
