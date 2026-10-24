// Run: node tests/team.test.js
const assert = require("assert");
const { addResult, aggregateTeam, parseResults, EXAMPLE_TEAM } = require("../app.js");

const mk = (over) => Object.assign({
  version: "1", name: "", department: "D", role: "R", workflow: "W", produces: "P",
  frequency_per_week: 2, cycle_hours: 3, cycle_hours_before: null, workload: "amber",
  friction: { digital: 3, cognitive: 1, technical: 0, strategic: 0, linguistic: 0, physical: 0 },
  steps: [{ id: "1", name: "a", friction: "high", lens: "digital", note: "" }, { id: "2", name: "b", friction: "low", lens: "cognitive", note: "" }],
  workarounds: [],
  fixes: [{ type: "quick_win", title: "F", steps: ["1"], lens: "digital", min_low: 30, min_high: 60, risk: "low", what: "w", catch: "c" }],
  need: "n", fear: "f"
}, over);
const load = (objs) => objs.reduce((l, o) => addResult(l, JSON.stringify(o)).list, []);

// totals and ranges: 2 x 3h = 6 h/wk; fix 30-60 min x 2 per week = 1 to 2 h/wk
let a = aggregateTeam(load([mk({})]));
assert.strictEqual(a.n, 1);
assert.strictEqual(a.hoursPerWeek, 6);
assert.strictEqual(a.savableLow, 1);
assert.strictEqual(a.savableHigh, 2);
assert.strictEqual(a.highShare, 0.5);
assert.strictEqual(a.topFixes[0].weekHigh, 120);
assert.ok(!("name" in a.topFixes[0]), "fix rows never carry a person's name");

// lens averages and clusters across two people
const two = load([mk({}), mk({ department: "E", friction: { digital: 1, cognitive: 1, technical: 0, strategic: 0, linguistic: 0, physical: 0 } })]);
a = aggregateTeam(two);
assert.strictEqual(a.lensAvg.digital, 2);
assert.strictEqual(a.lensAvg.cognitive, 1);
assert.strictEqual(a.lensHigh[0].key, "digital");
assert.strictEqual(a.lensHigh[0].count, 2);

// workload hidden under 5, shown at 5
assert.strictEqual(aggregateTeam(load(EXAMPLE_TEAM.slice(0, 4))).workload, null);
a = aggregateTeam(load(EXAMPLE_TEAM));
assert.deepStrictEqual(a.workload, { green: 1, amber: 3, red: 1 });
assert.strictEqual(a.topFixes.length, 8);
for (let i = 1; i < 8; i++) assert.ok(a.topFixes[i - 1].weekHigh >= a.topFixes[i].weekHigh, "top fixes sorted");

// example team is valid
EXAMPLE_TEAM.forEach((e) => assert.ok(parseResults(JSON.stringify(e)).ok, e.workflow));

// duplicates skipped, bad file skipped without blocking the rest
let l = [];
let r = addResult(l, JSON.stringify(mk({}))); assert.strictEqual(r.status, "added"); l = r.list;
r = addResult(l, JSON.stringify(mk({}))); assert.strictEqual(r.status, "duplicate"); assert.strictEqual(r.list.length, 1);
r = addResult(l, "not json at all"); assert.strictEqual(r.status, "error"); assert.strictEqual(r.list.length, 1);
r = addResult(l, JSON.stringify(mk({ workflow: "Other" }))); assert.strictEqual(r.status, "added"); assert.strictEqual(r.list.length, 2);

// empty team does not blow up
assert.strictEqual(aggregateTeam([]).n, 0);

console.log("team tests passed");
