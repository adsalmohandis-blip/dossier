"use strict";

// The receipt is the only thing a team publishes. These tests guard the line
// between what it may say and what must stay inside the bundle.

const state = require("../src/state");
const receipt = require("../src/receipt");
const { test } = require("./helpers");

const BUNDLE = {
  schema: "dossier.evidence/v0",
  release: "v1.4.2",
  project: { name: "Northwind thermostat", part_number: "NW-TH-220" },
  toolchain: { zephyr: "4.5.0" },
  generated_at: "2026-11-20T09:14:00.000Z",
  event_count: 11,
  chain_head: "a".repeat(64),
  changes: [{ task: "T-7", model: "claude-opus-5", files: ["src/radio.c"], at: "2026-11-19T10:00:00.000Z" }],
  decisions: [{ id: "ADR-003", title: "Drop the watchdog to 2 s", status: "accepted" }],
  approvals: [{ actor: "nadia.kessler", scope: "release", at: "2026-11-20T09:00:00.000Z" }],
  gates: [
    { gate: "static_analysis", status: "passed", measured: 0, threshold: 0 },
    { gate: "coverage", status: "passed", measured: 81.4, threshold: 70 },
    { gate: "binary_size", status: "skipped", reason: "disabled in config" },
    { gate: "human_approval", status: "passed" }
  ],
  gate_summary: { passed: true, failed_gates: [], blocking_reason: null },
  signature: null
};

// A bundle seals itself: the hash covers everything else in it. Building the
// fixtures the same way the tool does keeps these tests honest.
function seal(body) {
  const sealed = { ...body, bundle_hash: undefined };
  return { ...body, bundle_hash: state.sha256(state.stableStringify(sealed)) };
}

const SEALED = seal(BUNDLE);

const SECRETS = [
  "Northwind thermostat", "NW-TH-220", "v1.4.2", "nadia.kessler",
  "src/radio.c", "claude-opus-5", "ADR-003", "Drop the watchdog", "81.4", "4.5.0"
];

test("the receipt states only the hash, the dates and the status", () => {
  const html = receipt.toHtml(SEALED, { at: "2026-11-20T12:00:00.000Z" });
  for (const secret of SECRETS) {
    if (html.includes(secret)) throw new Error(`receipt leaked "${secret}"`);
  }
  if (!html.includes(SEALED.bundle_hash)) throw new Error("receipt omits the bundle hash");
});

test("the organisation appears only when it is asked for", () => {
  const without = receipt.toHtml(SEALED, {});
  if (without.includes("Organisation")) throw new Error("named an organisation nobody gave");
  const with_ = receipt.toHtml(SEALED, { org: "Northwind Sensors GmbH" });
  if (!with_.includes("Northwind Sensors GmbH")) throw new Error("ignored the organisation");
});

test("the receipt says it is not a certificate", () => {
  const html = receipt.toHtml(SEALED, {});
  if (!/Not a certificate/.test(html)) throw new Error("missing the limits of the receipt");
  if (!/does not certify/.test(html)) throw new Error("missing the certification disclaimer");
});

test("a tampered bundle produces a receipt that says so", () => {
  const tampered = { ...SEALED, event_count: SEALED.event_count + 1 };
  const facts = receipt.facts(tampered, {});
  if (facts.self_consistent) throw new Error("called a tampered bundle consistent");
  const html = receipt.toHtml(tampered, {});
  if (!/DOES NOT MATCH ITS HASH/.test(html)) throw new Error("receipt hid the mismatch");
});

test("a failed gate is visible in the status", () => {
  const failed = seal({
    ...BUNDLE,
    gates: [{ gate: "coverage", status: "failed", measured: 41.73, threshold: 70 }],
    gate_summary: { passed: false, failed_gates: ["coverage"], blocking_reason: "coverage below minimum" }
  });
  const html = receipt.toHtml(failed, {});
  if (!/RECORDED WITH A FAILED GATE/.test(html)) throw new Error("receipt hid a failed gate");
  if (html.includes("41.73")) throw new Error("receipt leaked the measured value");
});

test("the permanent link is derived from the hash, not chosen", () => {
  const url = receipt.urlFor(SEALED, "https://example.test/r");
  if (url !== `https://example.test/r/${SEALED.bundle_hash.slice(0, 16)}`) throw new Error(`unexpected url: ${url}`);
  const trailing = receipt.urlFor(SEALED, "https://example.test/r///");
  if (trailing !== url) throw new Error("trailing slashes changed the link");
});

test("the receipt carries no network requests", () => {
  const html = receipt.toHtml(SEALED, {});
  if (/<script/i.test(html)) throw new Error("receipt contains a script");
  if (/<link\b/i.test(html)) throw new Error("receipt loads an external stylesheet or font");
  const remote = html.match(/(?:src|href)="https?:\/\/[^"]+"/g) || [];
  const allowed = remote.filter((item) => !item.includes("admitnexus.com") && !item.includes("github.io"));
  if (allowed.length > 0) throw new Error(`receipt fetches ${allowed.join(", ")}`);
});

test("a bundle without a usable hash is refused", () => {
  let threw = false;
  try { receipt.toHtml({ bundle_hash: "short" }, {}); } catch (error) { threw = true; }
  if (!threw) throw new Error("built a receipt from a bundle with no hash");
});

