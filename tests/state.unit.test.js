"use strict";

const assert = require("assert");
const fs = require("fs");

const state = require("../src/state");
const { test, withTempRepo } = require("./helpers");

function initRepo(root) {
  fs.mkdirSync(state.stateDir(root), { recursive: true });
  fs.writeFileSync(state.eventsPath(root), "", "utf8");
}

test("stable stringify does not depend on key order", () => {
  assert.strictEqual(
    state.stableStringify({ b: 1, a: { d: 2, c: 3 } }),
    state.stableStringify({ a: { c: 3, d: 2 }, b: 1 })
  );
});

test("the first event links to the genesis hash", () => {
  withTempRepo((root) => {
    initRepo(root);
    const event = state.appendEvent(root, "init", { toolchain: "zephyr" });
    assert.strictEqual(event.prev, state.GENESIS);
    assert.strictEqual(event.seq, 1);
    assert.strictEqual(event.hash.length, 64);
  });
});

test("each event links to the one before it", () => {
  withTempRepo((root) => {
    initRepo(root);
    const first = state.appendEvent(root, "a", {});
    const second = state.appendEvent(root, "b", {});
    assert.strictEqual(second.prev, first.hash);
    assert.strictEqual(state.verifyChain(state.readEvents(root)).ok, true);
  });
});

test("an untouched chain verifies", () => {
  withTempRepo((root) => {
    initRepo(root);
    for (let i = 0; i < 5; i += 1) state.appendEvent(root, "change", { task: `T-${i}` });
    const result = state.verifyChain(state.readEvents(root));
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.broken_at, null);
  });
});

test("appending to an uninitialized workspace is refused", () => {
  withTempRepo((root) => {
    assert.throws(() => state.appendEvent(root, "init", {}), /Not a Dossier workspace/);
  });
});

test("a corrupt log line is reported with its line number", () => {
  withTempRepo((root) => {
    initRepo(root);
    state.appendEvent(root, "a", {});
    fs.appendFileSync(state.eventsPath(root), "{ not json\n", "utf8");
    assert.throws(() => state.readEvents(root), /Corrupt event log at line 2/);
  });
});
