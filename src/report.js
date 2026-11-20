"use strict";

/**
 * Builds a usage report the team can choose to send us.
 *
 * Dossier promises that nothing leaves the machine, and that promise is the
 * product. So this command sends nothing. It writes one file, prints all of it
 * to the terminal, and leaves the decision with the person who ran it.
 *
 * The report is counts and shapes. Never values. Anything that could identify
 * a company, a product, a person or a measurement is excluded by construction:
 * this module builds the report from a fixed set of derived numbers rather
 * than filtering a copy of the state, so a new field in the event log cannot
 * leak into a report by accident.
 */

const state = require("./state");
const { detect } = require("./detect");

const SCHEMA = "dossier.report/v0";

// Gate reports are skipped for a handful of reasons. The category is useful to
// us; the path or the tool name in the message is not.
function skipCategory(reason) {
  const text = String(reason || "").toLowerCase();
  if (text.includes("disabled")) return "disabled";
  if (text.includes("not found")) return "report_missing";
  if (text.includes("no line data")) return "report_empty";
  if (text.includes("unset")) return "not_configured";
  return "other";
}

function countBy(items, key) {
  const out = {};
  for (const item of items) {
    const value = item[key];
    if (value === undefined || value === null) continue;
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function build(root, options = {}) {
  state.requireInitialized(root);

  const config = state.readConfig(root) || {};
  const events = state.readEvents(root);
  const chain = state.verifyChain(events);

  const byType = countBy(events, "type");
  const gateEvents = events.filter((event) => event.type === "gate_run");
  const latestGates = gateEvents.length
    ? gateEvents[gateEvents.length - 1].payload.results || []
    : [];

  // Which gates the team turned on, by name. Names are ours, not theirs.
  const configured = Object.keys(config.gates || {}).filter(
    (name) => (config.gates[name] || {}).enabled !== false
  );

  const skips = {};
  for (const gate of latestGates) {
    if (gate.status !== "skipped") continue;
    const category = skipCategory(gate.reason);
    skips[category] = (skips[category] || 0) + 1;
  }

  // Which coding agents produced changes. The model name, never the prompt,
  // the files, or anything the model wrote.
  const models = [];
  for (const event of events) {
    const model = event.payload && event.payload.model;
    if (model && !models.includes(model)) models.push(model);
  }

  const bundles = events.filter((event) => event.type === "bundle");
  const forced = events.some(
    (event) => event.type === "bundle" && event.payload && event.payload.forced === true
  );

  return {
    schema: SCHEMA,
    generated_at: options.at || new Date().toISOString(),
    dossier_version: options.version || null,

    environment: {
      node_major: Number(process.versions.node.split(".")[0]),
      platform: process.platform,
      toolchain: detect(root).id || "unknown"
    },

    gates: {
      configured,
      configured_count: configured.length,
      passed: latestGates.filter((gate) => gate.status === "passed").length,
      failed: latestGates.filter((gate) => gate.status === "failed").length,
      skipped: latestGates.filter((gate) => gate.status === "skipped").length,
      skipped_because: skips
    },

    counts: {
      events: events.length,
      tasks_started: byType.task_start || 0,
      changes_recorded: byType.change || 0,
      decisions: byType.adr || 0,
      approvals: byType.approval || 0,
      gate_runs: gateEvents.length,
      bundles: bundles.length
    },

    models_used: models,
    bundle_forced_past_a_failed_gate: forced,
    chain_intact: chain.ok
  };
}

/**
 * The exact fields a report may contain, as a flat list, so the command can
 * show a person what they are about to share without them reading JSON.
 */
function explain(report) {
  const lines = [];
  lines.push("This report contains, and only contains:");
  lines.push("");
  lines.push(`  Dossier version        ${report.dossier_version || "unknown"}`);
  lines.push(`  Node major version     ${report.environment.node_major}`);
  lines.push(`  Operating system       ${report.environment.platform}`);
  lines.push(`  Toolchain detected     ${report.environment.toolchain}`);
  lines.push(`  Gates turned on        ${report.gates.configured.join(", ") || "none"}`);
  lines.push(`  Gate results           ${report.gates.passed} passed, ${report.gates.failed} failed, ${report.gates.skipped} skipped`);
  lines.push(`  Events recorded        ${report.counts.events}`);
  lines.push(`  Tasks, decisions       ${report.counts.tasks_started} started, ${report.counts.decisions} decisions`);
  lines.push(`  Approvals, bundles     ${report.counts.approvals} approvals, ${report.counts.bundles} bundles`);
  lines.push(`  Models used            ${report.models_used.join(", ") || "none recorded"}`);
  lines.push(`  Chain intact           ${report.chain_intact ? "yes" : "no"}`);
  lines.push("");
  lines.push("It does not contain file names, hashes, product or company names,");
  lines.push("release numbers, the names of people who approved, coverage figures,");
  lines.push("thresholds, or anything an agent wrote.");
  return lines.join("\n");
}

module.exports = { build, explain, SCHEMA };
