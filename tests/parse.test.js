// Run: node tests/parse.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { parseResults } = require("../app.js");

const sample = fs.readFileSync(path.join(__dirname, "..", "sample.json"), "utf8");
const obj = JSON.parse(sample);

// raw JSON
let r = parseResults(sample);
assert.ok(r.ok, "raw JSON parses");
assert.strictEqual(r.data.workflow, "KYC periodic review");
assert.strictEqual(r.data.cycle_hours_before, null);

// fenced, with chat text and stray braces around it
r = parseResults("Great, here are your results {not json}:\n```json\n" + sample + "\n```\nHope that helps! {bye}");
assert.ok(r.ok, "fenced JSON with chat text parses");
assert.strictEqual(r.data.steps.length, 7);

// invalid JSON
r = parseResults('Here you go: {"version": "1", "workflow": "x", ');
assert.ok(!r.ok && /cut off|typo/.test(r.error), "broken JSON -> error");
r = parseResults("no json here");
assert.ok(!r.ok, "no braces -> error");
r = parseResults("   ");
assert.ok(!r.ok, "empty -> error");

// missing friction
const noFr = JSON.parse(sample); delete noFr.friction;
r = parseResults(JSON.stringify(noFr));
assert.ok(!r.ok && /friction scores/.test(r.error), "missing friction -> error");

// out-of-range score clamped, unknown lens repaired, null before kept null
const bad = JSON.parse(sample);
bad.friction.digital = 9; bad.friction.cognitive = -2; bad.friction.technical = 1.6;
bad.steps[0].lens = "mystery"; bad.cycle_hours_before = null;
bad.fixes[0].min_low = 40; bad.fixes[0].min_high = 10;
r = parseResults(JSON.stringify(bad));
assert.ok(r.ok, "repairable input passes");
assert.strictEqual(r.data.friction.digital, 3);
assert.strictEqual(r.data.friction.cognitive, 0);
assert.strictEqual(r.data.friction.technical, 2);
assert.strictEqual(r.data.steps[0].lens, "cognitive");
assert.strictEqual(r.data.cycle_hours_before, null);
assert.deepStrictEqual([r.data.fixes[0].min_low, r.data.fixes[0].min_high], [10, 40]);

// bad frequency -> error
const noFreq = JSON.parse(sample); noFreq.frequency_per_week = 0;
assert.ok(!parseResults(JSON.stringify(noFreq)).ok, "zero frequency -> error");

console.log("parse tests passed");
