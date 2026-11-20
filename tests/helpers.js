"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const util = require("util");

const { run } = require("../src/cli");

function test(name, fn) {
  try {
    fn();
    console.log(`OK ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

// Runs the CLI in-process against a temp repo and captures output.
function cli(args, repoRoot) {
  const stdout = [];
  const stderr = [];
  const previousLog = console.log;
  const previousError = console.error;
  const previousExit = process.exitCode;
  console.log = (...values) => stdout.push(util.format(...values));
  console.error = (...values) => stderr.push(util.format(...values));
  let exitCode;
  try {
    process.exitCode = undefined;
    run([...args, `--root=${repoRoot}`]);
    exitCode = process.exitCode === undefined ? 0 : process.exitCode;
  } finally {
    console.log = previousLog;
    console.error = previousError;
    process.exitCode = previousExit;
  }
  return { stdout: stdout.join("\n"), stderr: stderr.join("\n"), exitCode };
}

function json(result) {
  return JSON.parse(result.stdout.trim());
}

function withTempRepo(fn, seed) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dossier-"));
  try {
    if (typeof seed === "function") seed(root);
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeFile(root, relative, content) {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
  return full;
}

module.exports = { test, cli, json, withTempRepo, writeFile };
