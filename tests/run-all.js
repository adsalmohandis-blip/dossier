#!/usr/bin/env node
"use strict";

// Discovers and runs every *.test.js under tests/ (including tests/contract/).
// Added so a test file can never silently stop running in CI.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const TESTS_DIR = __dirname;
const SELF = path.basename(__filename);

function discover(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...discover(full));
    } else if (entry.isFile() && entry.name.endsWith(".test.js") && entry.name !== SELF) {
      found.push(full);
    }
  }
  return found.sort();
}

const files = discover(TESTS_DIR);
if (files.length === 0) {
  console.error("No test files found.");
  process.exit(1);
}

const failed = [];
let passed = 0;

for (const file of files) {
  const rel = path.relative(path.join(TESTS_DIR, ".."), file);
  const result = spawnSync(process.execPath, [file], {
    cwd: path.join(TESTS_DIR, ".."),
    encoding: "utf8",
    env: process.env,
    maxBuffer: 1024 * 1024 * 64
  });
  const out = `${result.stdout || ""}${result.stderr || ""}`;
  const ok = result.status === 0 && !/^FAIL /m.test(out);
  if (ok) {
    passed += 1;
    console.log(`PASS ${rel}`);
  } else {
    failed.push(rel);
    console.log(`FAIL ${rel}`);
    process.stdout.write(out.trim() ? `${out.trim()}\n` : "");
  }
}

console.log("");
console.log(`${passed}/${files.length} test files passed.`);

if (failed.length > 0) {
  console.log("Failed files:");
  for (const file of failed) console.log(`  - ${file}`);
  process.exit(1);
}
