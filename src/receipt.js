"use strict";

/**
 * Builds the verification receipt: the one page a team can publish, print or
 * attach to a technical file so a third party can check that a bundle is the
 * bundle that was recorded.
 *
 * The receipt deliberately carries almost nothing. A hash, a date, a status.
 * No product names, no engineer names, no release dates, no component lists.
 * The organisation appears only when the team asks for it.
 *
 * A receipt is not a certificate. It says one thing: this file is the file
 * that was recorded on this date, and its chain was intact at that moment.
 */

const fs = require("fs");
const path = require("path");

const qr = require("./qr");
const bundleModule = require("./bundle");

const DEFAULT_URL_BASE = "https://admitnexus.com/dossier/r/";

function prefixOf(bundle) {
  if (!bundle || typeof bundle.bundle_hash !== "string" || bundle.bundle_hash.length < 16) {
    throw new Error("Cannot build a receipt: the bundle has no usable bundle_hash.");
  }
  return bundle.bundle_hash.slice(0, 16);
}

function urlFor(bundle, urlBase) {
  const base = (urlBase || DEFAULT_URL_BASE).replace(/\/+$/, "");
  return `${base}/${prefixOf(bundle)}`;
}

/**
 * The facts a receipt is allowed to state. Anything not listed here stays in
 * the bundle, which never leaves the team.
 */
function facts(bundle, options = {}) {
  const check = bundleModule.verify(bundle);
  const summary = bundle.gate_summary || {};
  const gateCount = Array.isArray(bundle.gates) ? bundle.gates.length : 0;
  const passed = Array.isArray(bundle.gates)
    ? bundle.gates.filter((gate) => gate.status === "passed").length
    : 0;
  const skipped = Array.isArray(bundle.gates)
    ? bundle.gates.filter((gate) => gate.status === "skipped").length
    : 0;

  return {
    hash: bundle.bundle_hash,
    prefix: prefixOf(bundle),
    schema: bundle.schema || "dossier.evidence/v0",
    recorded_at: bundle.generated_at || null,
    issued_at: options.at || new Date().toISOString(),
    self_consistent: check.ok,
    inconsistency: check.ok ? null : check.reason,
    chain_head: bundle.chain_head || null,
    event_count: typeof bundle.event_count === "number" ? bundle.event_count : null,
    gates_recorded: gateCount,
    gates_passed: passed,
    gates_skipped: skipped,
    gates_all_passed: summary.passed === true,
    approvals: Array.isArray(bundle.approvals) ? bundle.approvals.length : 0,
    signed: Boolean(bundle.signature),
    organisation: options.org || null,
    url: urlFor(bundle, options.urlBase),
  };
}

/**
 * Embeds a logo file as a data URI. A receipt may be read years from now, from
 * a folder, with no network: nothing in it may depend on a server still being up.
 */
function inlineLogo(file) {
  const resolved = path.resolve(String(file));
  const bytes = fs.readFileSync(resolved);
  const ext = path.extname(resolved).toLowerCase();
  const types = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp" };
  const type = types[ext];
  if (!type) throw new Error(`Unsupported logo format: ${ext || "(none)"}. Use png, jpg, svg or webp.`);
  if (bytes.length > 512 * 1024) {
    throw new Error(`Logo is ${Math.round(bytes.length / 1024)} KB. Keep it under 512 KB so the receipt stays small.`);
  }
  return `data:${type};base64,${bytes.toString("base64")}`;
}

function day(iso) {
  if (!iso) return "—";
  return String(iso).slice(0, 10);
}

/**
 * Renders a self-contained HTML page. No scripts, no fonts fetched, no
 * network calls: it has to survive being saved to a folder for ten years.
 */
function toHtml(bundle, options = {}) {
  const f = facts(bundle, options);
  const esc = qr.escapeXml;
  const code = qr.encode(f.url);
  const svg = qr.toSvg(code, {
    scale: 4,
    quiet: 2,
    dark: "#2A0A36",
    light: "#ffffff",
    label: `QR code linking to ${f.url}`,
  });

  const ok = f.self_consistent && f.gates_all_passed;
  const status = f.self_consistent
    ? f.gates_all_passed
      ? "RECORDED"
      : "RECORDED WITH A FAILED GATE"
    : "DOES NOT MATCH ITS HASH";

  const rows = [
    ["Bundle hash", `<span class="h">${esc(f.hash)}</span>`],
    ["Schema", esc(f.schema)],
    ["Recorded", esc(day(f.recorded_at))],
    ["Receipt issued", esc(day(f.issued_at))],
    ["Events in the chain", f.event_count === null ? "—" : String(f.event_count)],
    [
      "Gates",
      `${f.gates_passed} of ${f.gates_recorded} passed` +
        (f.gates_skipped > 0 ? `, ${f.gates_skipped} skipped` : ""),
    ],
    ["Approvals", String(f.approvals)],
    ["Signature", f.signed ? "present" : "none"],
  ];
  if (f.organisation) rows.unshift(["Organisation", esc(f.organisation)]);

  const plate = options.logo
    ? `<img class="logo" src="${esc(inlineLogo(options.logo))}" alt="ADMIT NEXUS">`
    : `<div class="plate"><span>ADMIT NEXUS</span></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Verification receipt ${esc(f.prefix)} — Dossier</title>
<meta name="robots" content="noindex">
<style>
:root{--admit:#2A0A36;--ink:#2A0A36;--body:#4a3f50;--muted:#7a6d80;--rule:#ded6e2;--ok:#0f6b53;--bad:#9b1c2e}
*{box-sizing:border-box}
body{margin:0;background:#fbfafc;color:var(--body);
  font:16px/1.6 "Helvetica Neue",Arial,system-ui,sans-serif}
.page{max-width:620px;margin:0 auto;padding:36px 24px 64px}
.plate{display:inline-block;background:#fff;border:1px solid var(--rule);padding:7px 11px}
.plate span{font-weight:700;font-size:15px;color:var(--admit);letter-spacing:.06em}
.logo{display:block;height:30px;width:auto}
h1{color:var(--ink);font-size:23px;font-weight:600;margin:26px 0 4px;letter-spacing:-.01em}
.sub{color:var(--muted);font-size:14px;margin:0 0 24px}
.card{background:#fff;border:1px solid var(--rule)}
.bar{display:flex;flex-wrap:wrap;gap:8px 14px;justify-content:space-between;align-items:center;
  padding:12px 16px;border-bottom:1px solid var(--rule)}
.id{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:13px;color:var(--muted)}
.badge{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;font-weight:700;letter-spacing:.04em;
  border:1px solid var(--ok);color:var(--ok);background:#eaf4f0;padding:4px 9px}
.badge.bad{border-color:var(--bad);color:var(--bad);background:#fbeef0}
dl{margin:0;padding:14px 16px;display:grid;grid-template-columns:max-content minmax(0,1fr);
  column-gap:20px;row-gap:8px;align-items:baseline;font-size:14px}
dt{color:var(--muted)}
dd{margin:0;color:var(--ink);overflow-wrap:anywhere;
  font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px}
.h{word-break:break-all}
.qr{display:flex;gap:18px;align-items:center;padding:14px 16px;border-top:1px solid var(--rule);flex-wrap:wrap}
.qr svg{display:block;width:124px;height:124px;border:1px solid var(--rule)}
.qr .t{font-size:13px;color:var(--muted);max-width:30ch}
.qr .t a{color:var(--admit);word-break:break-all}
.limits{margin:26px 0 0;padding:14px 16px;border-left:3px solid var(--admit);background:#f4f0f6;font-size:13.5px}
.limits b{color:var(--ink)}
footer{margin-top:30px;padding-top:16px;border-top:1px solid var(--rule);font-size:12.5px;color:var(--muted)}
footer a{color:var(--admit)}
@media (max-width:520px){dl{grid-template-columns:1fr;row-gap:2px}dd{margin-bottom:8px}}
@media print{body{background:#fff}.page{max-width:none;padding:0}.card{border-color:#999}}
</style>
</head>
<body>
<div class="page">

${plate}

<h1>Verification receipt</h1>
<p class="sub">Dossier · evidence record for AI-assisted firmware</p>

<div class="card">
  <div class="bar">
    <span class="id">receipt/${esc(f.prefix)}</span>
    <span class="badge${ok ? "" : " bad"}">${esc(status)}</span>
  </div>
  <dl>
${rows.map(([k, v]) => `    <dt>${esc(k)}</dt><dd>${v}</dd>`).join("\n")}
  </dl>
  <div class="qr">
    ${svg}
    <div class="t">Scan or open<br><a href="${esc(f.url)}">${esc(f.url)}</a></div>
  </div>
</div>

<div class="limits">
  <b>What this is.</b> A receipt that the evidence bundle with the hash above is the
  bundle recorded on the date above, and that its event chain was intact when it was
  recorded. Recompute the hash of your copy and compare it with this one.<br><br>
  <b>What this is not.</b> Not a certificate, not an approval, and not an assessment
  of the product. Dossier does not certify anything and does not test firmware.
  Conformity is decided by you and, where the law requires it, by a notified body.
</div>

<footer>
  Dossier is a product of ADMIT NEXUS.
  <a href="https://admitnexus.com">admitnexus.com</a><br>
  © 2026 ADMIT NEXUS. جميع الحقوق محفوظة.
</footer>

</div>
</body>
</html>
`;
}

module.exports = { facts, toHtml, urlFor, prefixOf, inlineLogo, DEFAULT_URL_BASE };
