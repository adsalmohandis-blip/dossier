"use strict";

/**
 * QR Code encoder. Byte mode, error correction level M, versions 1 to 10.
 * No dependencies. Returns a module matrix that callers render however they like.
 *
 * Reference: ISO/IEC 18004.
 */

// Data codewords, EC codewords per block, and block structure for level M.
// [dataCodewords, ecPerBlock, [blocks, dataPerBlock], [blocks, dataPerBlock]]
const VERSIONS = [
  null,
  [16, 10, [1, 16]],
  [28, 16, [1, 28]],
  [44, 26, [1, 44]],
  [64, 18, [2, 32]],
  [86, 24, [2, 43]],
  [108, 16, [4, 27]],
  [124, 18, [4, 31]],
  [154, 22, [2, 38], [2, 39]],
  [182, 22, [3, 36], [2, 37]],
  [216, 26, [4, 43], [1, 44]],
];

const ALIGNMENT = [
  null, [], [6, 18], [6, 22], [6, 26], [6, 30],
  [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

// ---------------------------------------------------------------- GF(256)

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function buildTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function generatorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function errorCorrection(data, ecCount) {
  const gen = generatorPoly(ecCount);
  const remainder = new Array(ecCount).fill(0);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j++) {
        remainder[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return remainder;
}

// ------------------------------------------------------------------- BCH

function bch(value, generator, bits) {
  let v = value << bits;
  const genBits = 32 - Math.clz32(generator);
  while (32 - Math.clz32(v) >= genBits) {
    v ^= generator << (32 - Math.clz32(v) - genBits);
  }
  return (value << bits) | v;
}

function formatBits(mask) {
  // Level M is 00, followed by the three mask bits.
  return bch(mask, 0x537, 10) ^ 0x5412;
}

function versionBits(version) {
  return bch(version, 0x1f25, 12);
}

// ----------------------------------------------------------------- encode

function toBytes(text) {
  const out = [];
  for (const char of String(text)) {
    const code = char.codePointAt(0);
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return out;
}

function pickVersion(byteLength) {
  for (let version = 1; version <= 10; version++) {
    const countBits = version < 10 ? 8 : 16;
    const capacity = Math.floor((VERSIONS[version][0] * 8 - 4 - countBits) / 8);
    if (byteLength <= capacity) return version;
  }
  throw new Error(
    `Cannot encode ${byteLength} bytes: this encoder stops at version 10 (213 bytes at level M).`
  );
}

function buildCodewords(bytes, version) {
  const spec = VERSIONS[version];
  const dataCodewords = spec[0];
  const countBits = version < 10 ? 8 : 16;

  const bits = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };

  push(0b0100, 4); // byte mode
  push(bytes.length, countBits);
  for (const byte of bytes) push(byte, 8);

  const capacity = dataCodewords * 8;
  push(0, Math.min(4, capacity - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0);

  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    data.push(byte);
  }
  const padding = [0xec, 0x11];
  for (let i = 0; data.length < dataCodewords; i++) data.push(padding[i % 2]);

  // Split into blocks, compute EC per block, then interleave.
  const groups = spec.slice(2);
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  for (const [blockCount, perBlock] of groups) {
    for (let i = 0; i < blockCount; i++) {
      const block = data.slice(offset, offset + perBlock);
      offset += perBlock;
      dataBlocks.push(block);
      ecBlocks.push(errorCorrection(block, spec[1]));
    }
  }

  const result = [];
  const longest = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < longest; i++) {
    for (const block of dataBlocks) if (i < block.length) result.push(block[i]);
  }
  for (let i = 0; i < spec[1]; i++) {
    for (const block of ecBlocks) result.push(block[i]);
  }
  return result;
}

// ------------------------------------------------------------- the matrix

function blankMatrix(size) {
  const modules = [];
  const reserved = [];
  for (let i = 0; i < size; i++) {
    modules.push(new Array(size).fill(false));
    reserved.push(new Array(size).fill(false));
  }
  return { modules, reserved, size };
}

function placeFinder(grid, row, col) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const y = row + r;
      const x = col + c;
      if (y < 0 || y >= grid.size || x < 0 || x >= grid.size) continue;
      const edge = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      grid.modules[y][x] = edge !== 2 && edge <= 3;
      grid.reserved[y][x] = true;
    }
  }
}

function placeAlignment(grid, version) {
  const centers = ALIGNMENT[version];
  for (const row of centers) {
    for (const col of centers) {
      const corner =
        (row === 6 && col === 6) ||
        (row === 6 && col === grid.size - 7) ||
        (row === grid.size - 7 && col === 6);
      if (corner) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const edge = Math.max(Math.abs(r), Math.abs(c));
          grid.modules[row + r][col + c] = edge !== 1;
          grid.reserved[row + r][col + c] = true;
        }
      }
    }
  }
}

function placeFunctionPatterns(grid, version) {
  placeFinder(grid, 0, 0);
  placeFinder(grid, 0, grid.size - 7);
  placeFinder(grid, grid.size - 7, 0);

  for (let i = 8; i < grid.size - 8; i++) {
    const dark = i % 2 === 0;
    grid.modules[6][i] = dark;
    grid.reserved[6][i] = true;
    grid.modules[i][6] = dark;
    grid.reserved[i][6] = true;
  }

  placeAlignment(grid, version);

  // Dark module, and the format-information areas.
  grid.modules[grid.size - 8][8] = true;
  grid.reserved[grid.size - 8][8] = true;
  for (let i = 0; i < 9; i++) {
    if (!grid.reserved[8][i]) grid.reserved[8][i] = true;
    if (!grid.reserved[i][8]) grid.reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    grid.reserved[8][grid.size - 1 - i] = true;
    grid.reserved[grid.size - 1 - i][8] = true;
  }

  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const a = Math.floor(i / 3);
      const b = (i % 3) + grid.size - 11;
      grid.reserved[b][a] = true;
      grid.reserved[a][b] = true;
    }
  }
}

function placeData(grid, codewords) {
  const bits = [];
  for (const codeword of codewords) {
    for (let i = 7; i >= 0; i--) bits.push((codeword >> i) & 1);
  }

  let index = 0;
  let upward = true;
  for (let col = grid.size - 1; col > 0; col -= 2) {
    if (col === 6) col = 5; // column 6 is the timing pattern
    for (let step = 0; step < grid.size; step++) {
      const row = upward ? grid.size - 1 - step : step;
      for (const c of [col, col - 1]) {
        if (grid.reserved[row][c]) continue;
        grid.modules[row][c] = index < bits.length && bits[index] === 1;
        index++;
      }
    }
    upward = !upward;
  }
  return index;
}

function maskAt(pattern, row, col) {
  switch (pattern) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    default: throw new Error(`Unknown mask pattern ${pattern}.`);
  }
}

function applyMask(grid, pattern) {
  const out = grid.modules.map((row) => row.slice());
  for (let row = 0; row < grid.size; row++) {
    for (let col = 0; col < grid.size; col++) {
      if (grid.reserved[row][col]) continue;
      if (maskAt(pattern, row, col)) out[row][col] = !out[row][col];
    }
  }
  return out;
}

function placeFormat(modules, size, mask) {
  const bits = formatBits(mask);
  // The format string is placed most significant bit first.
  const bit = (i) => ((bits >> (14 - i)) & 1) === 1;

  for (let i = 0; i <= 5; i++) modules[8][i] = bit(i);
  modules[8][7] = bit(6);
  modules[8][8] = bit(7);
  modules[7][8] = bit(8);
  for (let i = 9; i <= 14; i++) modules[14 - i][8] = bit(i);

  for (let i = 0; i <= 6; i++) modules[size - 1 - i][8] = bit(i);
  for (let i = 7; i <= 14; i++) modules[8][size - 15 + i] = bit(i);

  modules[size - 8][8] = true;
}

function placeVersion(modules, size, version) {
  if (version < 7) return;
  const bits = versionBits(version);
  for (let i = 0; i < 18; i++) {
    const on = ((bits >> i) & 1) === 1;
    const a = Math.floor(i / 3);
    const b = (i % 3) + size - 11;
    modules[b][a] = on;
    modules[a][b] = on;
  }
}

// ------------------------------------------------------------------ score

function penalty(modules, size) {
  let score = 0;

  // Rule 1: runs of five or more.
  const runs = (get) => {
    let total = 0;
    for (let a = 0; a < size; a++) {
      let run = 1;
      for (let b = 1; b < size; b++) {
        if (get(a, b) === get(a, b - 1)) {
          run++;
        } else {
          if (run >= 5) total += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) total += 3 + (run - 5);
    }
    return total;
  };
  score += runs((r, c) => modules[r][c]);
  score += runs((c, r) => modules[r][c]);

  // Rule 2: two-by-two blocks of one colour.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) {
        score += 3;
      }
    }
  }

  // Rule 3: finder-like patterns.
  const target = [true, false, true, true, true, false, true, false, false, false, false];
  const reversed = target.slice().reverse();
  const matches = (get, a, b) => {
    for (let i = 0; i < 11; i++) if (get(a, b + i) !== target[i]) return false;
    return true;
  };
  const matchesReversed = (get, a, b) => {
    for (let i = 0; i < 11; i++) if (get(a, b + i) !== reversed[i]) return false;
    return true;
  };
  for (let a = 0; a < size; a++) {
    for (let b = 0; b + 11 <= size; b++) {
      const row = (x, y) => modules[x][y];
      const col = (x, y) => modules[y][x];
      if (matches(row, a, b) || matchesReversed(row, a, b)) score += 40;
      if (matches(col, a, b) || matchesReversed(col, a, b)) score += 40;
    }
  }

  // Rule 4: balance of dark and light.
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (modules[r][c]) dark++;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

// ------------------------------------------------------------------- API

/**
 * Encode text as a QR code.
 * Returns { size, version, mask, modules } where modules[row][col] is true for dark.
 */
function encode(text) {
  const bytes = toBytes(text);
  const version = pickVersion(bytes.length);
  const size = version * 4 + 17;
  const codewords = buildCodewords(bytes, version);

  const grid = blankMatrix(size);
  placeFunctionPatterns(grid, version);
  placeData(grid, codewords);

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const modules = applyMask(grid, mask);
    placeFormat(modules, size, mask);
    placeVersion(modules, size, version);
    const score = penalty(modules, size);
    if (best === null || score < best.score) best = { score, mask, modules };
  }

  return { size, version, mask: best.mask, modules: best.modules };
}

/**
 * Render an encoded QR code as a standalone SVG string.
 * `scale` is the size of one module in SVG units; `quiet` is the margin in modules.
 */
function toSvg(qr, options = {}) {
  const scale = options.scale || 4;
  const quiet = options.quiet === undefined ? 4 : options.quiet;
  const dimension = (qr.size + quiet * 2) * scale;
  const dark = options.dark || "#000000";
  const light = options.light || "#ffffff";

  let path = "";
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (!qr.modules[row][col]) continue;
      path += `M${(col + quiet) * scale} ${(row + quiet) * scale}h${scale}v${scale}h-${scale}z`;
    }
  }

  const label = options.label ? escapeXml(options.label) : "QR code";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" `,
    `width="${dimension}" height="${dimension}" role="img" aria-label="${label}">`,
    `<rect width="${dimension}" height="${dimension}" fill="${light}"/>`,
    `<path d="${path}" fill="${dark}"/>`,
    `</svg>`,
  ].join("");
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = { encode, toSvg, escapeXml };
