"use strict";

// Append-only, hash-chained event log. No dependencies, no network.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STATE_DIR = ".dossier";
const EVENTS_FILE = "events.jsonl";
const CONFIG_FILE = "dossier.config.json";
const GENESIS = "0".repeat(64);

function stateDir(root) {
  return path.join(root || process.cwd(), STATE_DIR);
}

function eventsPath(root) {
  return path.join(stateDir(root), EVENTS_FILE);
}

function configPath(root) {
  return path.join(root || process.cwd(), CONFIG_FILE);
}

function isInitialized(root) {
  return fs.existsSync(stateDir(root));
}

function requireInitialized(root) {
  if (!isInitialized(root)) {
    throw new Error("Not a Dossier workspace. Run `dossier init` first.");
  }
}

// Stable stringify so the same content always hashes the same.
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function hashEvent(event) {
  const { hash, ...rest } = event;
  return sha256(stableStringify(rest));
}

function readEvents(root) {
  const file = eventsPath(root);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Corrupt event log at line ${index + 1}: ${error.message}`);
      }
    });
}

function lastHash(root) {
  const events = readEvents(root);
  return events.length === 0 ? GENESIS : events[events.length - 1].hash;
}

function appendEvent(root, type, payload, options = {}) {
  requireInitialized(root);
  const event = {
    seq: readEvents(root).length + 1,
    type,
    at: options.at || new Date().toISOString(),
    prev: lastHash(root),
    payload: payload || {}
  };
  event.hash = hashEvent(event);
  fs.appendFileSync(eventsPath(root), `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

// Returns { ok, broken_at, reason }
function verifyChain(events) {
  let prev = GENESIS;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event.prev !== prev) {
      return { ok: false, broken_at: event.seq || i + 1, reason: "previous hash does not match" };
    }
    if (hashEvent(event) !== event.hash) {
      return { ok: false, broken_at: event.seq || i + 1, reason: "event content does not match its hash" };
    }
    prev = event.hash;
  }
  return { ok: true, broken_at: null, reason: null };
}

function readConfig(root) {
  const file = configPath(root);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeConfig(root, config) {
  fs.writeFileSync(configPath(root), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

module.exports = {
  STATE_DIR,
  GENESIS,
  stateDir,
  eventsPath,
  configPath,
  isInitialized,
  requireInitialized,
  stableStringify,
  sha256,
  hashEvent,
  readEvents,
  lastHash,
  appendEvent,
  verifyChain,
  readConfig,
  writeConfig
};
