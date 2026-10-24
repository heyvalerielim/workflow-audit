// Run: node tests/signup.test.js
const assert = require("assert");
const { isEmail, buildSignup, gateEnabled, SIGNUP_URL } = require("../app.js");

// email validation
["a@b.co", " first.last@company.com ", "x+tag@sub.example.org"].forEach((e) => assert.ok(isEmail(e), e));
["", "plain", "a@b", "a b@c.com", "@c.com", "a@.com ", "a@@b.com", null, undefined, "a@b." + "c".repeat(200)].forEach((e) => assert.ok(!isEmail(e), String(e)));

// payload holds only the five signup fields and trims/caps them
const p = buildSignup("  me@x.com ", " Val ", "A".repeat(300));
assert.deepStrictEqual(Object.keys(p).sort(), ["company", "consent", "email", "name", "source"]);
assert.strictEqual(p.email, "me@x.com");
assert.strictEqual(p.name, "Val");
assert.strictEqual(p.company.length, 200);
assert.strictEqual(p.consent, true);
assert.strictEqual(p.source, "download");
["friction", "steps", "fixes", "workflow", "need", "fear", "cycle_hours"].forEach((k) => assert.ok(!(k in p), "no results key: " + k));
assert.deepStrictEqual(Object.keys(buildSignup("a@b.co")).length, 5); // missing name/company still fine

// gate logic: empty URL -> off
assert.strictEqual(gateEnabled(""), false);
assert.strictEqual(gateEnabled("   "), false);
assert.strictEqual(gateEnabled(undefined), false);
assert.strictEqual(gateEnabled("https://script.google.com/macros/s/abc/exec"), true);
assert.strictEqual(gateEnabled(SIGNUP_URL), false, "committed config must have the gate off");

console.log("signup tests passed");
