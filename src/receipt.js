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

// There is deliberately no default. A QR code that resolves to nothing is
// worse than no QR code at all: on a printed technical file it makes a true
// record look forged. A receipt carries a link only when the person running
// the command has said where they are going to host it.
const DEFAULT_URL_BASE = null;

// The approved ADMIT header logo, shipped with the tool so a receipt stays
// self-contained. It is white and orange on brand purple and carries no
// transparency, so it is placed on the purple band it was drawn for.
const BRAND_LOGO = path.join(__dirname, "assets", "admit-logo.png");

function prefixOf(bundle) {
  if (!bundle || typeof bundle.bundle_hash !== "string" || bundle.bundle_hash.length < 16) {
    throw new Error("Cannot build a receipt: the bundle has no usable bundle_hash.");
  }
  return bundle.bundle_hash.slice(0, 16);
}

// Hosts we would have to be running a service to serve. We are not, so a
// receipt pointing at one of them would be a QR code leading to nothing.
const UNSERVED = /^https?:\/\/(?:[a-z0-9-]+\.)*admitnexus\.com(?::\d+)?\//i;

function urlFor(bundle, urlBase) {
  if (!urlBase) return null;
  const base = String(urlBase).replace(/\/+$/, "");
  if (UNSERVED.test(`${base}/`)) {
    throw new Error(
      `We do not host receipts yet, so ${base} would not resolve and the QR code ` +
      "would lead nowhere. Point --url-base at somewhere you control, or leave it " +
      "out and the receipt will carry no link."
    );
  }
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
  const link = f.url
    ? (() => {
        const code = qr.encode(f.url);
        const svg = qr.toSvg(code, {
          scale: 4,
          quiet: 2,
          dark: "#2A0A36",
          light: "#ffffff",
          label: `QR code linking to ${f.url}`,
        });
        return `<div class="qr">
    ${svg}
    <div class="t">Scan or open<br><a href="${esc(f.url)}">${esc(f.url)}</a></div>
  </div>`;
      })()
    : `<div class="qr nolink">
    <div class="t">This receipt is not published anywhere. Check it by recomputing the
    hash of your copy of the bundle, or host this page yourself and reissue it with
    <code>--url-base</code>.</div>
  </div>`;

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

  let plate = `<span class="wordmark">ADMIT</span>`;
  const logoFile = options.logo || (fs.existsSync(BRAND_LOGO) ? BRAND_LOGO : null);
  if (logoFile) {
    try {
      plate = `<img class="logo" src="${esc(inlineLogo(logoFile))}" alt="ADMIT">`;
    } catch (error) {
      if (options.logo) throw error; // an explicit choice that fails should say so
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Verification receipt ${esc(f.prefix)} — Dossier</title>
<meta name="robots" content="noindex">
<style>
/* ADMIT identity, ANX-BRND-TPL-001 V1.1 (approved 19 Nov 2026). */
:root{
  --purple:#581970;--orange:#F3AA1F;--canvas:#F7F3F9;--card:#fff;
  --border:#DED4E3;--tint:#FBF9FC;--divider:#EFE8F2;
  --ink:#2E2A32;--muted:#6B6470;--on-purple:#E7D9EE;--on-purple-sub:#B79BC6;
  --ok:#157a5b;--ok-bg:#E8F4EF;--bad:#9b1c2e;--bad-bg:#FBEEF0;
}
*{box-sizing:border-box}
body{margin:0;background:var(--canvas);color:var(--ink);
  font:16px/1.6 "Segoe UI",system-ui,Arial,Helvetica,sans-serif}
.page{max-width:640px;margin:26px auto}
.card{background:var(--card);border:1px solid var(--border);border-radius:10px;overflow:hidden}
.band{background:var(--purple);border-bottom:3px solid var(--orange);
  display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 22px}
.band .logo{display:block;height:34px;width:auto}
.band .wordmark{font-size:19px;font-weight:700;color:#fff;letter-spacing:.06em}
.band .id{font-family:ui-monospace,Consolas,Menlo,monospace;font-size:11.5px;
  color:var(--on-purple-sub);text-align:right}
.body{padding:24px 22px 4px}
.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:1.4px;
  font-weight:700;color:var(--orange);margin:0 0 8px}
h1{color:var(--purple);font-size:24px;line-height:1.2;font-weight:700;margin:0 0 6px}
.sub{color:var(--muted);font-size:13.5px;margin:0 0 20px}
.status{display:inline-block;font-family:ui-monospace,Consolas,Menlo,monospace;
  font-size:11.5px;font-weight:700;letter-spacing:.06em;padding:5px 11px;border-radius:4px;
  border:1px solid var(--ok);color:var(--ok);background:var(--ok-bg);margin-bottom:18px}
.status.bad{border-color:var(--bad);color:var(--bad);background:var(--bad-bg)}
dl{margin:0;border:1px solid var(--border);border-radius:8px;overflow:hidden}
dl > div{display:grid;grid-template-columns:150px minmax(0,1fr);gap:16px;
  padding:10px 14px;border-top:1px solid var(--divider);align-items:baseline}
dl > div:first-child{border-top:0}
dl > div:nth-child(even){background:var(--tint)}
dt{color:var(--muted);font-size:12.5px}
dd{margin:0;color:var(--ink);font-family:ui-monospace,Consolas,Menlo,monospace;
  font-size:12.5px;overflow-wrap:anywhere}
.h{word-break:break-all}
.qr{display:flex;gap:18px;align-items:center;margin-top:18px;flex-wrap:wrap;
  background:var(--tint);border:1px solid var(--border);border-radius:8px;padding:14px}
.qr svg{display:block;width:120px;height:120px;background:#fff;
  border:1px solid var(--border);border-radius:6px}
.qr .t{font-size:13px;color:var(--muted);max-width:32ch}
.qr .t a{color:var(--purple);word-break:break-all}
.qr.nolink .t{max-width:48ch}
.limits{margin:20px 0 22px;padding:15px 18px;border-left:3px solid var(--orange);
  background:var(--tint);border-radius:0 8px 8px 0;font-size:13.5px}
.limits b{color:var(--purple)}
footer{background:var(--purple);color:var(--on-purple-sub);padding:16px 22px;font-size:12px;line-height:1.7}
footer a{color:#fff}
@media (max-width:540px){
  .page{margin:0}.card{border:0;border-radius:0}
  dl > div{grid-template-columns:1fr;gap:2px}
  dd{margin-bottom:4px}
}
@media print{
  body{background:#fff}.page{margin:0;max-width:none}
  .card{border:0;border-radius:0}
  .band{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style>
</head>
<body>
<div class="page">
<div class="card">

  <div class="band">
    ${plate}
    <div class="id">VERIFICATION RECEIPT<br>receipt/${esc(f.prefix)}</div>
  </div>

  <div class="body">
    <p class="eyebrow">Dossier · evidence record for AI-assisted firmware</p>
    <h1>This file is the file that was recorded.</h1>
    <p class="sub">Recompute the hash of your copy and compare it with the one below.</p>

    <span class="status${ok ? "" : " bad"}">${esc(status)}</span>

    <dl>
${rows.map(([k, v]) => `      <div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("\n")}
    </dl>

    ${link}

    <div class="limits">
      <b>What this is.</b> A record that the evidence bundle with the hash above is the
      bundle recorded on the date above, and that its event chain was intact when it was
      recorded.<br><br>
      <b>What this is not.</b> Not a certificate, not an approval, and not an assessment of
      the product. Dossier does not certify anything and does not test firmware. Conformity
      is decided by you and, where the law requires it, by a notified body.
    </div>
  </div>

  <footer>
    Dossier is a product of ADMIT NEXUS.
    <a href="https://admitnexus.com">admitnexus.com</a><br>
    © 2026 ADMIT NEXUS. All rights reserved.
  </footer>

</div>
</div>
</body>
</html>
`;
}

module.exports = { facts, toHtml, urlFor, prefixOf, inlineLogo, DEFAULT_URL_BASE };
