"use strict";

// The QR encoder has one job: produce a code a phone can read. These vectors
// were produced by this encoder and then checked, module by module, against an
// independent reference implementation, and the rendered codes were scanned
// back with a real decoder. Freezing them here keeps the check in CI without
// adding a dependency. If one of these hashes changes, the code changed shape,
// and it has to be scanned again before the change is accepted.

const crypto = require("crypto");
const qr = require("../src/qr");
const { test } = require("./helpers");

const VECTORS = [
  { text: "HELLO", version: 1, mask: 4, size: 21,
    sha256: "32fbc389880456d584e32bdf2c31372391c92f9f853e119a75bec5e14c380a23" },
  { text: "https://admitnexus.com/dossier/r/9f2c4a1b8e0d6572", version: 4, mask: 2, size: 33,
    sha256: "9d8de5ae96f0e90deaefcb0d2632831e97eda13f7af3f3b106977ff5d027f785" },
  { text: "https://adsalmohandis-blip.github.io/dossier/r/ba6f57a167032b14", version: 5, mask: 2, size: 37,
    sha256: "6d3d326f353692889fe9f52da799ec42b2a91f59dfa93c7d653b06a4f58af6ff" },
  { text: "x".repeat(84), version: 5, mask: 0, size: 37,
    sha256: "828d6d94d58d40c1ae8210987a7a1ab106fefb7b2a24eb144fd59c5d6fdad37b" },
  { text: "x".repeat(213), version: 10, mask: 0, size: 57,
    sha256: "f673820bb5ccd3f0f6035d879c98fa30d6d1f03153cace0b9a23da4e0a681a53" }
];

function fingerprint(code) {
  const flat = code.modules.map((row) => row.map((m) => (m ? "1" : "0")).join("")).join("");
  return crypto.createHash("sha256").update(flat).digest("hex");
}

for (const vector of VECTORS) {
  const label = vector.text.length > 24 ? `${vector.text.length} characters` : vector.text;
  test(`encodes ${label} to the recorded matrix`, () => {
    const code = qr.encode(vector.text);
    if (code.version !== vector.version) throw new Error(`version ${code.version}, expected ${vector.version}`);
    if (code.mask !== vector.mask) throw new Error(`mask ${code.mask}, expected ${vector.mask}`);
    if (code.size !== vector.size) throw new Error(`size ${code.size}, expected ${vector.size}`);
    const actual = fingerprint(code);
    if (actual !== vector.sha256) throw new Error(`matrix changed: ${actual}`);
  });
}

test("places the three finder patterns", () => {
  const code = qr.encode("finder");
  const corners = [[0, 0], [0, code.size - 7], [code.size - 7, 0]];
  for (const [row, col] of corners) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const edge = Math.max(Math.abs(r - 3), Math.abs(c - 3));
        const expected = edge !== 2 && edge <= 3;
        if (code.modules[row + r][col + c] !== expected) {
          throw new Error(`finder at ${row},${col} wrong at ${r},${c}`);
        }
      }
    }
  }
});

test("keeps the dark module dark", () => {
  const code = qr.encode("dark module");
  if (code.modules[code.size - 8][8] !== true) throw new Error("dark module is light");
});

test("refuses to encode more than it can carry", () => {
  let threw = false;
  try { qr.encode("x".repeat(214)); } catch (error) {
    threw = true;
    if (!/version 10/.test(error.message)) throw new Error(`unhelpful message: ${error.message}`);
  }
  if (!threw) throw new Error("encoded 214 bytes without complaining");
});

test("renders an SVG that contains the modules", () => {
  const code = qr.encode("svg");
  const svg = qr.toSvg(code, { scale: 4, quiet: 4 });
  if (!svg.startsWith("<svg")) throw new Error("not an SVG");
  const dimension = (code.size + 8) * 4;
  if (!svg.includes(`viewBox="0 0 ${dimension} ${dimension}"`)) throw new Error("wrong viewBox");
  const dark = code.modules.flat().filter(Boolean).length;
  const drawn = (svg.match(/M\d+ \d+h4v4h-4z/g) || []).length;
  if (drawn !== dark) throw new Error(`drew ${drawn} modules for ${dark} dark ones`);
});

