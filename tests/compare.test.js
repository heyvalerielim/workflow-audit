// Run: node tests/compare.test.js
const assert = require("assert");
const { compareResults, sameWorkflow, makePreviousSample, validate } = require("../app.js");
const sample = validate(JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "sample.json"), "utf8"))).data;

const prev = makePreviousSample();
const c = compareResults(prev, sample);

// KPI deltas: 6 h -> 4 h per cycle, friction up on 3 lenses before, workload red -> amber
assert.strictEqual(c.cycle.prev, 6);
assert.strictEqual(c.cycle.now, 4);
assert.strictEqual(c.cycle.delta, -2);
assert.strictEqual(c.friction.digital.delta, -1);
assert.strictEqual(c.friction.cognitive.delta, -1);
assert.strictEqual(c.friction.technical.delta, -1);
assert.strictEqual(c.friction.linguistic.delta, 0);
assert.strictEqual(c.workload.change, "better");
assert.strictEqual(c.painful.now, 6);
assert.strictEqual(c.painful.prev, 5); // prev highs: steps 1, 4, 5, 6 and the removed step 8
assert.ok(c.savable.now.hi > 0);

// step matching
const by = (n) => c.steps.find((s) => s.name === n);
assert.strictEqual(by("Script in my voice").status, "worse"); // was medium, now high
assert.strictEqual(by("Post and log").status, "calmer"); // was medium, now low
assert.strictEqual(by("Export clips").status, "same");
assert.strictEqual(by("Record voiceover").status, "new");
assert.deepStrictEqual(c.removed.map((s) => s.name), ["Manual cover resize"]);

// name matching ignores case and spaces
const p2 = JSON.parse(JSON.stringify(sample)); p2.steps[0].name = "  EXPORT   clips "; p2.steps[0].friction = "low";
assert.strictEqual(compareResults(p2, sample).steps[0].status, "worse");

// workflow mismatch detection
assert.ok(c.sameWorkflow);
assert.ok(sameWorkflow({ workflow: "Monthly  Expense claims (example)" }, { workflow: "monthly expense claims" }));
assert.ok(!sameWorkflow({ workflow: "Monthly sales report" }, { workflow: "Monthly expense claims" }));
assert.ok(!compareResults(Object.assign({}, prev, { workflow: "Something else" }), sample).sameWorkflow);

// identical results: no change anywhere
const same = compareResults(sample, sample);
assert.strictEqual(same.cycle.delta, 0);
assert.ok(same.steps.every((s) => s.status === "same"));
assert.strictEqual(same.removed.length, 0);

console.log("compare tests passed");
