"use strict";

const fs = require("fs");
const path = require("path");

const state = require("./state");
const gates = require("./gates");
const bundle = require("./bundle");
const receipt = require("./receipt");
const report = require("./report");
const { detect } = require("./detect");

const VERSION = require("../package.json").version;

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (const item of argv) {
    if (item.startsWith("--")) {
      const [key, value] = item.slice(2).split("=");
      args.flags[key] = value === undefined ? true : value;
    } else {
      args._.push(item);
    }
  }
  return args;
}

function root(flags) {
  return flags.root ? path.resolve(String(flags.root)) : process.cwd();
}

function out(flags, humanLines, jsonValue) {
  if (flags.json) {
    console.log(JSON.stringify(jsonValue, null, 2));
    return;
  }
  for (const line of humanLines) console.log(line);
}

const HELP = `dossier ${VERSION} — evidence bundles for AI-assisted firmware

Usage
  dossier init [--root=DIR]
  dossier status [--json]
  dossier task start <id> --title=TEXT [--model=NAME] [--provider=NAME]
  dossier task end <id> [--files=a.c,b.h]
  dossier adr add --id=ADR-001 --title=T --context=C --decision=D [--consequences=a,b] [--status=proposed]
  dossier adr list [--json]
  dossier approve --actor=NAME [--release=v1.0.0] [--scope=TEXT]
  dossier gate run [--json]
  dossier bundle --release=v1.0.0 [--out=DIR] [--json]
  dossier verify <bundle.json> [--json]
  dossier receipt <bundle.json> [--out=DIR] [--org=NAME] [--url-base=URL] [--logo=FILE] [--json]
  dossier report [--out=FILE] [--json]
  dossier doctor [--json]

Dossier records. It does not generate code, analyse code, build SBOMs or grant certification.
Everything runs locally. Nothing is sent anywhere.
`;

function cmdInit(args) {
  const base = root(args.flags);
  if (state.isInitialized(base)) {
    throw new Error("Already a Dossier workspace.");
  }
  const toolchain = detect(base);
  fs.mkdirSync(state.stateDir(base), { recursive: true });
  fs.writeFileSync(state.eventsPath(base), "", "utf8");

  const config = {
    project: { name: path.basename(base), slug: path.basename(base).toLowerCase().replace(/[^a-z0-9]+/g, "-") },
    toolchain: { id: toolchain.id, label: toolchain.label, build_command: toolchain.build_command },
    gates: gates.DEFAULT_GATES
  };
  state.writeConfig(base, config);
  state.appendEvent(base, "init", { toolchain: toolchain.id, schema: "dossier.evidence/v0" });

  out(args.flags, [
    `Initialized Dossier in ${state.STATE_DIR}/`,
    `Toolchain detected: ${toolchain.label}${toolchain.matched_on ? ` (${toolchain.matched_on})` : ""}`,
    "",
    "Next: dossier task start T-1 --title=\"first change\""
  ], { initialized: true, toolchain: toolchain.id, config });
}

function cmdStatus(args) {
  const base = root(args.flags);
  state.requireInitialized(base);
  const events = state.readEvents(base);
  const chain = state.verifyChain(events);
  const config = state.readConfig(base) || {};
  const counts = events.reduce((acc, event) => {
    acc[event.type] = (acc[event.type] || 0) + 1;
    return acc;
  }, {});
  out(args.flags, [
    `Project: ${config.project ? config.project.name : "(unknown)"}`,
    `Toolchain: ${config.toolchain ? config.toolchain.label : "(unknown)"}`,
    `Events: ${events.length}`,
    `Chain: ${chain.ok ? "intact" : `BROKEN at ${chain.broken_at} — ${chain.reason}`}`,
    `Recorded: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ") || "nothing yet"}`
  ], { project: config.project, toolchain: config.toolchain, events: events.length, chain, counts });
}

function cmdTask(args) {
  const base = root(args.flags);
  state.requireInitialized(base);
  const action = args._[1];
  const id = args._[2];
  if (!action || !["start", "end"].includes(action)) throw new Error("Usage: dossier task start|end <id>");
  if (!id) throw new Error("Missing task id.");

  if (action === "start") {
    if (!args.flags.title) throw new Error("Missing --title.");
    const event = state.appendEvent(base, "task_start", {
      task: id,
      title: String(args.flags.title),
      model: args.flags.model ? String(args.flags.model) : null,
      provider: args.flags.provider ? String(args.flags.provider) : null
    });
    out(args.flags, [`Task ${id} started.`], { recorded: event.type, task: id, hash: event.hash });
    return;
  }

  const files = args.flags.files ? String(args.flags.files).split(",").map((f) => f.trim()).filter(Boolean) : [];
  const started = state.readEvents(base).filter((e) => e.type === "task_start" && e.payload.task === id).pop();
  if (!started) throw new Error(`Task ${id} was never started. Run \`dossier task start ${id}\` first.`);
  const event = state.appendEvent(base, "change", {
    task: id,
    title: started.payload.title,
    model: started.payload.model,
    provider: started.payload.provider,
    files
  });
  out(args.flags, [`Task ${id} recorded with ${files.length} file(s).`], { recorded: event.type, task: id, files, hash: event.hash });
}

function cmdAdr(args) {
  const base = root(args.flags);
  state.requireInitialized(base);
  const action = args._[1] || "list";

  if (action === "list") {
    const items = state.readEvents(base).filter((e) => e.type === "adr").map((e) => e.payload);
    out(args.flags, items.length === 0
      ? ["No decisions recorded."]
      : items.map((item) => `${item.id}  ${item.status.padEnd(9)}  ${item.title}`), items);
    return;
  }

  if (action !== "add") throw new Error("Usage: dossier adr add|list");
  for (const required of ["id", "title", "context", "decision"]) {
    if (!args.flags[required]) throw new Error(`Missing --${required}.`);
  }
  const status = String(args.flags.status || "proposed");
  if (!["proposed", "accepted", "superseded", "rejected"].includes(status)) {
    throw new Error("Invalid --status. Use proposed, accepted, superseded or rejected.");
  }
  const payload = {
    id: String(args.flags.id),
    title: String(args.flags.title),
    status,
    context: String(args.flags.context),
    decision: String(args.flags.decision),
    consequences: args.flags.consequences ? String(args.flags.consequences).split(",").map((c) => c.trim()).filter(Boolean) : [],
    supersedes: args.flags.supersedes ? String(args.flags.supersedes) : null
  };
  const event = state.appendEvent(base, "adr", payload);
  out(args.flags, [`Recorded ${payload.id}: ${payload.title}`], { recorded: "adr", ...payload, hash: event.hash });
}

function cmdApprove(args) {
  const base = root(args.flags);
  state.requireInitialized(base);
  if (!args.flags.actor) throw new Error("Missing --actor. An approval must name a person.");
  const payload = {
    actor: String(args.flags.actor),
    release: args.flags.release ? String(args.flags.release) : null,
    scope: args.flags.scope ? String(args.flags.scope) : "release"
  };
  const event = state.appendEvent(base, "approval", payload);
  out(args.flags, [`Approval recorded for ${payload.actor}.`], { recorded: "approval", ...payload, hash: event.hash });
}

function cmdGate(args) {
  const base = root(args.flags);
  state.requireInitialized(base);
  if ((args._[1] || "run") !== "run") throw new Error("Usage: dossier gate run");
  const config = state.readConfig(base) || {};
  const approvals = state.readEvents(base).filter((e) => e.type === "approval");
  const results = gates.runAll(base, config.gates, approvals);
  const summary = gates.summarize(results);
  state.appendEvent(base, "gate_run", { results, summary });

  const lines = results.map((item) => {
    const mark = item.status === "passed" ? "PASS" : item.status === "failed" ? "FAIL" : "SKIP";
    return `${mark}  ${item.gate}${item.reason ? ` — ${item.reason}` : ""}`;
  });
  if (!summary.passed) lines.push("", `Blocked: ${summary.blocking_reason}`);
  out(args.flags, lines, { results, summary });
  if (!summary.passed) process.exitCode = 1;
}

function cmdBundle(args) {
  const base = root(args.flags);
  state.requireInitialized(base);
  const built = bundle.build(base, { release: args.flags.release ? String(args.flags.release) : null, force: Boolean(args.flags.force) });
  const outDir = path.join(state.stateDir(base), "bundles");
  fs.mkdirSync(outDir, { recursive: true });
  const safeRelease = built.release.replace(/[^A-Za-z0-9._-]/g, "_");
  const jsonFile = path.join(outDir, `${safeRelease}.json`);
  const mdFile = path.join(outDir, `${safeRelease}.md`);
  fs.writeFileSync(jsonFile, `${JSON.stringify(built, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdFile, bundle.toMarkdown(built), "utf8");
  state.appendEvent(base, "bundle", { release: built.release, bundle_hash: built.bundle_hash });

  out(args.flags, [
    `Bundle written for ${built.release}`,
    `  ${path.relative(base, jsonFile)}`,
    `  ${path.relative(base, mdFile)}`,
    `Hash: ${built.bundle_hash}`
  ], { release: built.release, bundle_hash: built.bundle_hash, json: jsonFile, markdown: mdFile });
}

function cmdVerify(args) {
  const file = args._[1];
  if (!file) throw new Error("Usage: dossier verify <bundle.json>");
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const result = bundle.verify(parsed);
  out(args.flags, [result.ok ? "VERIFIED — bundle matches its hash." : `NOT VERIFIED — ${result.reason}`], {
    verified: result.ok,
    reason: result.reason,
    release: parsed.release || null,
    bundle_hash: parsed.bundle_hash || null
  });
  if (!result.ok) process.exitCode = 1;
}

function cmdReceipt(args) {
  const file = args._[1];
  if (!file) throw new Error("Usage: dossier receipt <bundle.json>");
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));

  const options = {
    org: args.flags.org ? String(args.flags.org) : null,
    urlBase: args.flags["url-base"] ? String(args.flags["url-base"]) : null,
    logo: args.flags.logo ? String(args.flags.logo) : null
  };
  const facts = receipt.facts(parsed, options);
  const html = receipt.toHtml(parsed, options);

  const outDir = args.flags.out
    ? path.resolve(String(args.flags.out))
    : path.join(path.dirname(path.resolve(file)), "receipts");
  fs.mkdirSync(outDir, { recursive: true });
  const htmlFile = path.join(outDir, `${facts.prefix}.html`);
  fs.writeFileSync(htmlFile, html, "utf8");

  out(args.flags, [
    `Receipt written for ${facts.prefix}`,
    `  ${htmlFile}`,
    `Permanent link: ${facts.url}`,
    facts.self_consistent
      ? "The bundle matches its hash."
      : `WARNING — the bundle does not match its hash (${facts.inconsistency}).`,
    "",
    "This receipt is a record, not a certificate. Host it yourself, or publish it",
    "at the permanent link with a Team plan."
  ], { ...facts, file: htmlFile });

  if (!facts.self_consistent) process.exitCode = 1;
}

function cmdReport(args) {
  const base = root(args.flags);
  const built = report.build(base, { version: VERSION });

  const file = args.flags.out
    ? path.resolve(String(args.flags.out))
    : path.join(base, "dossier-report.json");
  fs.writeFileSync(file, `${JSON.stringify(built, null, 2)}\n`, "utf8");

  out(args.flags, [
    report.explain(built),
    "",
    `Written to ${path.relative(base, file) || file}`,
    "",
    "Nothing has been sent anywhere. If you want to help us work out which",
    "parts of this are worth building, attach that file to an email to",
    "dossier@admitnexus.com. If you would rather not, delete it and carry on;",
    "the tool behaves identically either way."
  ], built);
}

function cmdDoctor(args) {
  const base = root(args.flags);
  const checks = [];
  checks.push({ check: "node_version", ok: Number(process.versions.node.split(".")[0]) >= 18, detail: process.versions.node });
  checks.push({ check: "workspace_initialized", ok: state.isInitialized(base), detail: state.STATE_DIR });
  const toolchain = detect(base);
  checks.push({ check: "toolchain_detected", ok: toolchain.id !== "unknown", detail: toolchain.label });
  if (state.isInitialized(base)) {
    const chain = state.verifyChain(state.readEvents(base));
    checks.push({ check: "chain_intact", ok: chain.ok, detail: chain.ok ? "intact" : chain.reason });
  }
  const ok = checks.every((item) => item.ok);
  out(args.flags, checks.map((item) => `${item.ok ? "OK  " : "WARN"} ${item.check}: ${item.detail}`), { ok, checks });
}

const COMMANDS = {
  init: cmdInit,
  status: cmdStatus,
  task: cmdTask,
  adr: cmdAdr,
  approve: cmdApprove,
  gate: cmdGate,
  bundle: cmdBundle,
  verify: cmdVerify,
  receipt: cmdReceipt,
  report: cmdReport,
  doctor: cmdDoctor
};

function run(argv) {
  const args = parseArgs(argv);
  const command = args._[0];

  if (!command || args.flags.help || command === "help") {
    console.log(HELP);
    return;
  }
  if (command === "--version" || args.flags.version || command === "version") {
    console.log(VERSION);
    return;
  }
  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    console.error("Run `dossier help` to see the available commands.");
    process.exitCode = 1;
    return;
  }
  try {
    handler(args);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { run, parseArgs, VERSION, HELP };
