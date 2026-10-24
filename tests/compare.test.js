// Run: node tests/compare.test.js
const assert = require("assert");
const { compareResults, sameWorkflow, makePreviousSample, validate } = require("../app.js");
const sample = validate(JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "sample.json"), "utf8"))).data;

const prev = makePreviousSample();
const c = compareResults(prev, sample);

// KPI deltas: 3.5 h -> 2.5 h per cycle, friction higher on 3 lenses before, workload red -> amber
assert.strictEqual(c.cycle.prev, 3.5);
assert.strictEqual(c.cycle.now, 2.5);
assert.strictEqual(c.cycle.delta, -1);
assert.strictEqual(c.friction.technical.delta, -1);
assert.strictEqual(c.friction.strategic.delta, -1);
assert.strictEqual(c.friction.linguistic.delta, -1);
assert.strictEqual(c.friction.digital.delta, 0);
assert.strictEqual(c.workload.change, "better");
assert.strictEqual(c.painful.now, 4);
assert.strictEqual(c.painful.prev, 6); // prev highs: steps 1, 2, 3, 4, 7 and the removed step 8
assert.ok(c.savable.now.hi > 0);
assert.ok(c.savable.deltaHigh < 0, "bigger savings were on the table before");

// step matching
const by = (n) => c.steps.find((s) => s.name === n);
assert.strictEqual(by("Write the review memo").status, "worse"); // was low, now medium
assert.strictEqual(by("Pull the review list").status, "calmer"); // was high, now medium
assert.strictEqual(by("Update records and tracker").status, "calmer");
assert.strictEqual(by("Run name screening").status, "same");
assert.strictEqual(by("Send for checker approval").status, "new");
assert.deepStrictEqual(c.removed.map((s) => s.name), ["Print and file paper copies"]);

// name matching ignores case and spaces
const p2 = JSON.parse(JSON.stringify(sample)); p2.steps[0].name = "  PULL   the review LIST "; p2.steps[0].friction = "low";
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
