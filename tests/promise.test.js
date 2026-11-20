"use strict";

// Dossier tells every engineer who runs it that nothing leaves their machine.
// That sentence is the product. A promise kept by good intentions is a promise
// one hurried commit away from being broken, so it is kept here instead.
//
// If a future version does need to upload something — registering a receipt
// hash so a link resolves, say — this test is the thing that must be changed
// first, deliberately, in a commit of its own. Read RECEIPTS.md before you do:
// an upload may only ever happen behind an explicit, informed yes from the
// person running the command.

const fs = require("fs");
const path = require("path");
const { test } = require("./helpers");

const SRC = path.join(__dirname, "..", "src");

// Modules that are allowed to reach the network, by name.
//
// Nothing is listed, and that is the point. A command that uploads something
// one day gets its module added here, in a commit of its own, by someone who
// has read RECEIPTS.md and can answer for the five conditions in it. Every
// other module in the tool stays unable to open a socket, so "it only uploads
// when you ask" is a fact about the code rather than a claim about intent.
const MAY_REACH_THE_NETWORK = new Set([]);

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

// Ways a Node program reaches the network, or reaches a program that can.
const FORBIDDEN = [
  { pattern: /require\(\s*["'](?:node:)?(?:http|https|net|tls|dgram|dns|http2)["']\s*\)/, why: "requires a network module" },
  { pattern: /require\(\s*["'](?:node:)?child_process["']\s*\)/, why: "spawns processes, which can reach the network" },
  { pattern: /\bfetch\s*\(/, why: "calls fetch" },
  { pattern: /\bXMLHttpRequest\b/, why: "uses XMLHttpRequest" },
  { pattern: /\bnavigator\.sendBeacon\b/, why: "uses sendBeacon" },
  { pattern: /\bWebSocket\s*\(/, why: "opens a WebSocket" }
];

test("no module reaches the network unless it is named as one that may", () => {
  const offenders = [];
  for (const file of sourceFiles(SRC)) {
    const name = path.relative(SRC, file).split(path.sep).join("/");
    if (MAY_REACH_THE_NETWORK.has(name)) continue;
    const source = fs.readFileSync(file, "utf8");
    for (const { pattern, why } of FORBIDDEN) {
      if (pattern.test(source)) offenders.push(`${path.relative(SRC, file)} ${why}`);
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      `Dossier promises that nothing leaves the machine:\n  ${offenders.join("\n  ")}\n` +
      "If this is intentional, read RECEIPTS.md and change this test on purpose."
    );
  }
});

test("the promise is still printed where people read it", () => {
  const help = require("../src/cli").HELP;
  if (!/Nothing is uploaded unless you ask for it by name/.test(help)) {
    throw new Error("the command line no longer tells people when anything is uploaded");
  }
});

test("a receipt cannot point at a host that does not serve receipts", () => {
  const receipt = require("../src/receipt");
  for (const base of [
    "https://admitnexus.com/dossier/r",
    "https://www.admitnexus.com/dossier/r",
    "https://dossier.admitnexus.com/r"
  ]) {
    let threw = false;
    try {
      receipt.urlFor({ bundle_hash: "d".repeat(64) }, base);
    } catch (error) {
      threw = true;
      if (!/do not host receipts yet/i.test(error.message)) {
        throw new Error(`unclear refusal for ${base}: ${error.message}`);
      }
    }
    if (!threw) throw new Error(`built a link at ${base}, which serves nothing`);
  }
});

// A contact address that nobody reads is worse than none at all, and an
// invented one on a published page costs more than a missing one. The approved
// address is recorded in ANX-BRND-TPL-001: all outbound client mail goes from
// info@admitnexus.com. Nothing here may quietly introduce another.
test("no invented contact address has crept in", () => {
  const roots = ["src", "docs", "README.md", "RECEIPTS.md"];
  const approved = new Set(["info@admitnexus.com"]);
  const found = new Map();

  const scan = (target) => {
    const full = path.join(__dirname, "..", target);
    if (!fs.existsSync(full)) return;
    if (fs.statSync(full).isDirectory()) {
      for (const entry of fs.readdirSync(full)) scan(path.join(target, entry));
      return;
    }
    if (!/\.(js|html|md|json|css)$/.test(full)) return;
    const text = fs.readFileSync(full, "utf8");
    for (const match of text.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)) {
      const address = match[0].replace(/\.$/, "");
      if (address.endsWith("admitnexus.com") && !approved.has(address)) {
        found.set(address, target);
      }
    }
  };
  roots.forEach(scan);

  if (found.size > 0) {
    const list = [...found].map(([a, where]) => `${a} in ${where}`).join("\n  ");
    throw new Error(`Addresses that are not the approved one:\n  ${list}`);
  }
});
