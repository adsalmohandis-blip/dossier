"use strict";

// Builds the evidence bundle: the artifact a team hands to an assessor.

const state = require("./state");
const gates = require("./gates");

function eventsOfType(events, type) {
  return events.filter((event) => event.type === type);
}

function build(root, options) {
  const opts = options || {};
  const release = opts.release;
  if (!release) throw new Error("Missing --release. Every bundle belongs to a release.");

  const config = state.readConfig(root) || {};
  const events = state.readEvents(root);
  const chain = state.verifyChain(events);
  if (!chain.ok) {
    throw new Error(`Refusing to build a bundle: the event log is broken at event ${chain.broken_at} (${chain.reason}).`);
  }

  const approvals = eventsOfType(events, "approval").filter(
    (event) => !event.payload.release || event.payload.release === release
  );
  const gateResults = gates.runAll(root, config.gates, approvals);
  const summary = gates.summarize(gateResults);

  if (!summary.passed && !opts.force) {
    throw new Error(`Refusing to build a bundle: ${summary.blocking_reason}`);
  }

  const changes = eventsOfType(events, "change").map((event) => ({
    task: event.payload.task || null,
    model: event.payload.model || null,
    provider: event.payload.provider || null,
    files: event.payload.files || [],
    at: event.at
  }));

  const decisions = eventsOfType(events, "adr").map((event) => ({
    id: event.payload.id,
    title: event.payload.title,
    status: event.payload.status,
    context: event.payload.context,
    decision: event.payload.decision,
    consequences: event.payload.consequences || [],
    supersedes: event.payload.supersedes || null,
    at: event.at
  }));

  const body = {
    schema: "dossier.evidence/v0",
    release,
    project: config.project || {},
    toolchain: config.toolchain || {},
    generated_at: opts.at || new Date().toISOString(),
    event_count: events.length,
    chain_head: events.length === 0 ? state.GENESIS : events[events.length - 1].hash,
    changes,
    decisions,
    approvals: approvals.map((event) => ({
      actor: event.payload.actor,
      scope: event.payload.scope || "release",
      at: event.at
    })),
    gates: gateResults,
    gate_summary: summary,
    signature: null
  };

  body.bundle_hash = state.sha256(state.stableStringify({ ...body, bundle_hash: undefined }));
  return body;
}

// Recomputes the hash of a bundle object and reports whether it still matches.
function verify(bundle) {
  if (!bundle || typeof bundle !== "object") {
    return { ok: false, reason: "bundle is not an object" };
  }
  if (!bundle.bundle_hash) {
    return { ok: false, reason: "bundle has no bundle_hash" };
  }
  const expected = state.sha256(state.stableStringify({ ...bundle, bundle_hash: undefined }));
  if (expected !== bundle.bundle_hash) {
    return { ok: false, reason: "bundle content does not match its hash" };
  }
  return { ok: true, reason: null };
}

function toMarkdown(bundle) {
  const lines = [];
  lines.push(`# Evidence bundle — ${bundle.release}`);
  lines.push("");
  lines.push(`- Generated: ${bundle.generated_at}`);
  lines.push(`- Schema: ${bundle.schema}`);
  lines.push(`- Bundle hash: \`${bundle.bundle_hash}\``);
  lines.push(`- Chain head: \`${bundle.chain_head}\``);
  lines.push("");
  lines.push("## Gates");
  lines.push("");
  lines.push("| Gate | Status | Measured | Threshold | Note |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const gate of bundle.gates) {
    lines.push(
      `| ${gate.gate} | ${gate.status} | ${gate.measured === null ? "—" : gate.measured} | ${gate.threshold === null ? "—" : gate.threshold} | ${gate.reason || ""} |`
    );
  }
  lines.push("");
  lines.push("## Approvals");
  lines.push("");
  if (bundle.approvals.length === 0) {
    lines.push("None recorded.");
  } else {
    for (const approval of bundle.approvals) {
      lines.push(`- ${approval.actor} approved ${approval.scope} on ${approval.at}`);
    }
  }
  lines.push("");
  lines.push("## Changes");
  lines.push("");
  if (bundle.changes.length === 0) {
    lines.push("None recorded.");
  } else {
    lines.push("| Task | Model | Files | Recorded |");
    lines.push("| --- | --- | --- | --- |");
    for (const change of bundle.changes) {
      lines.push(`| ${change.task || "—"} | ${change.model || "—"} | ${change.files.length} | ${change.at} |`);
    }
  }
  lines.push("");
  lines.push("## Decisions");
  lines.push("");
  if (bundle.decisions.length === 0) {
    lines.push("None recorded.");
  } else {
    for (const decision of bundle.decisions) {
      lines.push(`- **${decision.id}** ${decision.title} (${decision.status})`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

module.exports = { build, verify, toMarkdown };
