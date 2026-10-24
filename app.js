/* Workflow audit: individual flow. Plain JS, no build step. Works from file:// and static hosting.
   Part 1 is pure (parse + validate) and also runs in Node for tests. Part 2 is the UI. */
"use strict";

const CREDITS = "Based on Loon and Ally's workflow audit."; // names get added here, rendered into every [data-credits] slot

var LENSES = {
  digital: "Moving files and app switching",
  cognitive: "Mental load and checking",
  technical: "Tools not talking to each other",
  strategic: "Steps in the wrong order",
  linguistic: "Language and communication",
  physical: "Device, space and storage"
};
var LENS_KEYS = Object.keys(LENSES);

/* ---------- Part 1: parse + validate ---------- */

// Find JSON objects in free text. Tries each "{" as a start, matches braces (string-aware), keeps what parses.
function extractObjects(text) {
  var found = [], i = 0;
  while ((i = text.indexOf("{", i)) !== -1) {
    var depth = 0, inStr = false, esc = false, end = -1;
    for (var j = i; j < text.length; j++) {
      var c = text[j];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) { end = j; break; }
    }
    if (end === -1) { i++; continue; }
    try {
      var o = JSON.parse(text.slice(i, end + 1));
      if (o && typeof o === "object" && !Array.isArray(o)) { found.push(o); i = end + 1; continue; }
    } catch (e) { /* not JSON, try the next brace */ }
    i++;
  }
  return found;
}

function fail(msg) { return { ok: false, error: msg }; }
function str(v, max) { return (v == null ? "" : String(v)).trim().slice(0, max || 400); }
function num(v) { var n = typeof v === "string" && v.trim() !== "" ? Number(v) : v; return typeof n === "number" && isFinite(n) ? n : null; }
function oneOf(v, list, dflt) { v = str(v).toLowerCase(); return list.indexOf(v) !== -1 ? v : dflt; }

function validate(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("The results are not in the expected shape. Ask the AI: json again");

  if (!raw.friction || typeof raw.friction !== "object" || Array.isArray(raw.friction))
    return fail("The results are missing the friction scores. Ask the AI: json again");
  var friction = {}, anyLens = false;
  LENS_KEYS.forEach(function (k) {
    var n = num(raw.friction[k]);
    if (n !== null) anyLens = true;
    friction[k] = n === null ? 0 : Math.min(3, Math.max(0, Math.round(n)));
  });
  if (!anyLens) return fail("The friction scores are empty. Ask the AI: json again");

  if (!Array.isArray(raw.steps) || !raw.steps.length)
    return fail("The results are missing the workflow steps. Ask the AI: json again");
  var steps = raw.steps.filter(function (s) { return s && typeof s === "object"; }).map(function (s, i) {
    return {
      id: str(s.id, 12) || String(i + 1),
      name: str(s.name, 80) || "Step " + (i + 1),
      friction: oneOf(s.friction, ["high", "medium", "low"], "medium"),
      lens: oneOf(s.lens, LENS_KEYS, "cognitive"),
      note: str(s.note, 300)
    };
  });
  if (!steps.length) return fail("The workflow steps could not be read. Ask the AI: json again");
  var ids = steps.map(function (s) { return s.id; });

  if (!Array.isArray(raw.fixes) || !raw.fixes.length)
    return fail("The results are missing the suggested fixes. Ask the AI: json again");
  var fixes = raw.fixes.filter(function (f) { return f && typeof f === "object"; }).map(function (f) {
    var lo = num(f.min_low), hi = num(f.min_high);
    lo = lo === null ? 0 : Math.max(0, Math.round(lo));
    hi = hi === null ? lo : Math.max(0, Math.round(hi));
    if (lo > hi) { var t = lo; lo = hi; hi = t; }
    return {
      type: oneOf(f.type, ["quick_win", "bigger_change"], "quick_win"),
      title: str(f.title, 120) || "Untitled fix",
      steps: (Array.isArray(f.steps) ? f.steps : []).map(function (x) { return str(x, 12); }).filter(function (x) { return ids.indexOf(x) !== -1; }),
      lens: oneOf(f.lens, LENS_KEYS, "cognitive"),
      min_low: lo, min_high: hi,
      risk: oneOf(f.risk, ["low", "medium", "high"], "medium"),
      what: str(f.what, 500),
      catch: str(f.catch, 400)
    };
  });
  if (!fixes.length) return fail("The suggested fixes could not be read. Ask the AI: json again");

  var freq = num(raw.frequency_per_week), cyc = num(raw.cycle_hours);
  if (freq === null || freq <= 0) return fail("The results are missing how often this workflow happens (times per week). Ask the AI: json again");
  if (cyc === null || cyc < 0) return fail("The results are missing the hours one cycle takes. Ask the AI: json again");
  var before = num(raw.cycle_hours_before);

  return {
    ok: true,
    data: {
      version: "1",
      name: str(raw.name, 80),
      department: str(raw.department, 80),
      role: str(raw.role, 100),
      workflow: str(raw.workflow, 100) || "Untitled workflow",
      produces: str(raw.produces, 200),
      frequency_per_week: freq,
      cycle_hours: cyc,
      cycle_hours_before: before !== null && before > 0 ? before : null,
      workload: oneOf(raw.workload, ["green", "amber", "red"], "amber"),
      friction: friction,
      steps: steps,
      workarounds: (Array.isArray(raw.workarounds) ? raw.workarounds : []).map(function (w) { return str(w, 120); }).filter(Boolean).slice(0, 8),
      fixes: fixes,
      need: str(raw.need, 400),
      fear: str(raw.fear, 400)
    }
  };
}

// text pasted by the person -> { ok, data } or { ok:false, error }
function parseResults(text) {
  text = String(text == null ? "" : text);
  if (!text.trim()) return fail("Paste the results the AI gave you first.");
  if (text.indexOf("{") === -1) return fail("I could not find any results in what you pasted. Copy the whole block the AI printed at the end, or ask it: json again");
  var objs = extractObjects(text);
  if (!objs.length) return fail("The results look cut off or have a typo, so they could not be read. Ask the AI: json again");
  var pick = objs.filter(function (o) { return "friction" in o || "steps" in o || "workflow" in o; })[0] || objs[0];
  return validate(pick);
}

function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "workflow"; }



/* ---------- Compare with a previous result (pure) ---------- */
var RANK = { low: 1, medium: 2, high: 3 }, WL_RANK = { green: 1, amber: 2, red: 3 };
function normName(x) { return String(x).toLowerCase().replace(/\s+/g, " ").trim(); }
function normWorkflow(x) { return normName(String(x).replace(/\(\s*example\s*\)/ig, "")); }
function sameWorkflow(a, b) { return normWorkflow(a.workflow) === normWorkflow(b.workflow); }
function r1(n) { return Math.round(n * 10) / 10; }
function savableWeek(d) { // hours per week if every fix lands
  var lo = 0, hi = 0;
  d.fixes.forEach(function (f) { lo += f.min_low / 60 * d.frequency_per_week; hi += f.min_high / 60 * d.frequency_per_week; });
  return { lo: lo, hi: hi };
}
function highCount(d) { return d.steps.filter(function (s) { return s.friction === "high"; }).length; }

// prev, now: validated results. Steps are matched by name (case-insensitive, trimmed).
function compareResults(prev, now) {
  var pm = {}, used = {};
  prev.steps.forEach(function (s) { var k = normName(s.name); if (!(k in pm)) pm[k] = s; });
  var steps = now.steps.map(function (s) {
    var k = normName(s.name), p = pm[k];
    if (!p) return { id: s.id, name: s.name, status: "new", prevFriction: null };
    used[k] = true;
    var d = RANK[s.friction] - RANK[p.friction];
    return { id: s.id, name: s.name, status: d < 0 ? "calmer" : d > 0 ? "worse" : "same", prevFriction: p.friction };
  });
  var removed = prev.steps.filter(function (s) { return !used[normName(s.name)]; }).map(function (s) { return { name: s.name, friction: s.friction }; });
  var friction = {};
  LENS_KEYS.forEach(function (k) { friction[k] = { prev: prev.friction[k], now: now.friction[k], delta: now.friction[k] - prev.friction[k] }; });
  var pw = WL_RANK[prev.workload] - WL_RANK[now.workload];
  var sp = savableWeek(prev), sn = savableWeek(now);
  return {
    sameWorkflow: sameWorkflow(prev, now),
    cycle: { prev: prev.cycle_hours, now: now.cycle_hours, delta: r1(now.cycle_hours - prev.cycle_hours) },
    savable: { prev: sp, now: sn, deltaHigh: r1(sn.hi - sp.hi) },
    painful: { prev: highCount(prev), now: highCount(now), delta: highCount(now) - highCount(prev) },
    workload: { prev: prev.workload, now: now.workload, change: pw > 0 ? "better" : pw < 0 ? "worse" : "same" },
    friction: friction, steps: steps, removed: removed
  };
}

// demo only: a "previous" version of the sample with worse numbers, one extra step later removed, steps that were rougher then
function makePreviousSample() {
  var p = JSON.parse(JSON.stringify(SAMPLE));
  p.cycle_hours = 3.5; p.cycle_hours_before = null; p.workload = "red";
  p.friction.technical = 3; p.friction.strategic = 2; p.friction.linguistic = 2;
  p.steps = p.steps.filter(function (s) { return s.name !== "Send for checker approval"; }); // so it shows as New now
  p.steps.forEach(function (s) {
    if (s.name === "Pull the review list" || s.name === "Update records and tracker") s.friction = "high"; // calmer now
    if (s.name === "Write the review memo") s.friction = "low"; // worse now
  });
  p.fixes[3].min_high = 25; p.fixes[4].min_high = 35; // bigger savings were still on the table
  p.steps.push({ id: "8", name: "Print and file paper copies", friction: "high", lens: "physical", note: "Printing every review pack and filing it by hand" }); // later removed
  return validate(p).data;
}

/* ---------- Team: add files + aggregate (pure, also used in Node tests) ---------- */

// text of one file -> { status: "added" | "duplicate" | "error", list, error? }. Same validator as the individual flow.
function addResult(list, text) {
  var r = parseResults(text);
  if (!r.ok) return { status: "error", list: list, error: r.error };
  var key = JSON.stringify(r.data);
  if (list.some(function (d) { return JSON.stringify(d) === key; })) return { status: "duplicate", list: list };
  return { status: "added", list: list.concat([r.data]) };
}

var MIN_FOR_WORKLOAD = 5;

function aggregateTeam(list) {
  var n = list.length, hoursPerWeek = 0, lo = 0, hi = 0, steps = 0, high = 0, all = [];
  var lensSum = {}, lensHigh = {};
  LENS_KEYS.forEach(function (k) { lensSum[k] = 0; lensHigh[k] = 0; });
  var wl = { green: 0, amber: 0, red: 0 };
  list.forEach(function (d) {
    var f = d.frequency_per_week;
    hoursPerWeek += d.cycle_hours * f;
    d.fixes.forEach(function (x) {
      lo += x.min_low / 60 * f; hi += x.min_high / 60 * f;
      all.push({ title: x.title, type: x.type, risk: x.risk, workflow: d.workflow, department: d.department, weekLow: x.min_low * f, weekHigh: x.min_high * f });
    });
    d.steps.forEach(function (s) { steps++; if (s.friction === "high") { high++; lensHigh[s.lens]++; } });
    LENS_KEYS.forEach(function (k) { lensSum[k] += d.friction[k]; });
    wl[d.workload]++;
  });
  var lensAvg = {};
  LENS_KEYS.forEach(function (k) { lensAvg[k] = n ? lensSum[k] / n : 0; });
  return {
    n: n, hoursPerWeek: hoursPerWeek, savableLow: lo, savableHigh: hi,
    steps: steps, highSteps: high, highShare: steps ? high / steps : 0,
    lensAvg: lensAvg,
    lensHigh: LENS_KEYS.map(function (k) { return { key: k, label: LENSES[k], count: lensHigh[k] }; }).sort(function (a, b) { return b.count - a.count; }),
    topFixes: all.sort(function (a, b) { return b.weekHigh - a.weekHigh; }).slice(0, 8),
    workload: n >= MIN_FOR_WORKLOAD ? wl : null // privacy: never exposed for small groups
  };
}

/* ---------- Example team: synthetic, for the Team view demo ---------- */
// compact builder; friction order is LENS_KEYS
function ex(dept, role, wf, produces, freq, hrs, before, load, fr, steps, fixes, need, fear) {
  return {
    version: "1", name: "", department: dept, role: role, workflow: wf + " (example)", produces: produces,
    frequency_per_week: freq, cycle_hours: hrs, cycle_hours_before: before, workload: load,
    friction: { digital: fr[0], cognitive: fr[1], technical: fr[2], strategic: fr[3], linguistic: fr[4], physical: fr[5] },
    steps: steps.map(function (s, i) { return { id: String(i + 1), name: s[0], friction: s[1], lens: s[2], note: s[3] }; }),
    workarounds: [],
    fixes: fixes.map(function (f) { return { type: f[0], title: f[1], steps: f[2], lens: f[3], min_low: f[4], min_high: f[5], risk: f[6], what: f[7], catch: f[8] }; }),
    need: need, fear: fear
  };
}
var EXAMPLE_TEAM = [
  ex("Finance Ops", "Senior executive", "Monthly expense claims", "Approved claims sent to payroll", 0.25, 6, null, "amber", [2, 3, 1, 1, 0, 0],
    [["Collect receipts", "high", "digital", "Chasing people and hunting through email"], ["Check against policy", "high", "cognitive", "Every line checked by eye"], ["Key into payroll system", "medium", "technical", "Retyping from a spreadsheet"], ["Chase approvals", "medium", "strategic", "Approvers get the list too late"], ["Send to payroll", "low", "digital", "Quick once approved"]],
    [["quick_win", "Auto-extract receipt amounts", ["1"], "digital", 20, 45, "low", "Use the AI tool to read receipt photos into a table of date, vendor and amount.", "Check totals against the originals."],
     ["quick_win", "Policy checklist prompt", ["2"], "cognitive", 30, 60, "low", "Paste the policy and the claim table and ask the AI to flag lines outside policy.", "It flags, you decide."],
     ["bigger_change", "Import file for payroll", ["3"], "technical", 25, 50, "medium", "Ask IT whether payroll accepts a file import instead of retyping.", "Needs IT time and a test run."],
     ["bigger_change", "Send approvers a draft early", ["4"], "strategic", 15, 30, "low", "Share the draft list mid-month so approvals are done before the deadline.", "Late claims still need a second pass."]],
    "Less retyping and fewer chasing emails at month end.", "A wrong amount reaching payroll."),
  ex("Sales Operations", "Analyst", "Monthly sales report", "Report pack for the leadership meeting", 0.25, 8, 12, "red", [3, 2, 3, 2, 1, 0],
    [["Export from CRM", "high", "technical", "Three exports that never match"], ["Clean and merge", "high", "digital", "Copy and paste across five files"], ["Build charts", "medium", "cognitive", "Rebuilt from scratch every month"], ["Write commentary", "medium", "linguistic", "Hard to explain the numbers briefly"], ["Chase regional numbers", "high", "strategic", "Regions send data after the deadline"], ["Format and send", "low", "digital", "Routine"]],
    [["quick_win", "Standard merge template", ["2"], "digital", 40, 90, "low", "Keep one template with fixed columns so the merge is a paste, not a rebuild.", "Columns drift when the CRM changes."],
     ["quick_win", "Draft commentary with AI", ["4"], "linguistic", 20, 40, "low", "Give the AI the table and ask for five plain sentences on what changed and why.", "Check every claim before sending."],
     ["quick_win", "Earlier deadline for regions", ["5"], "strategic", 20, 40, "low", "Move the regional deadline two days earlier and send a reminder.", "Needs manager backing."],
     ["bigger_change", "Scheduled CRM export", ["1"], "technical", 45, 90, "medium", "Set up one scheduled report in the CRM that matches the merge template.", "Needs CRM admin access."],
     ["bigger_change", "Reusable chart pack", ["3"], "cognitive", 30, 60, "medium", "Build the charts once on a linked sheet so they refresh from the merged data.", "Broken links if the sheet layout changes."]],
    "To stop rebuilding the same report every month.", "A number that is wrong going to leadership."),
  ex("People and Culture", "HR coordinator", "New hire onboarding", "A new starter ready on day one", 1, 5, null, "amber", [2, 2, 2, 3, 2, 1],
    [["Collect starter details", "medium", "digital", "Details arrive by email in different formats"], ["Request laptop and access", "high", "strategic", "IT needs three weeks but is asked one week out"], ["Prepare contract pack", "medium", "linguistic", "Edit the template by hand each time"], ["Plan first week", "high", "cognitive", "Agenda built from memory"], ["Book desk and welcome", "low", "physical", "Simple but easy to forget"]],
    [["quick_win", "Starter details form", ["1"], "digital", 15, 30, "low", "Use one form so details arrive in one format.", "Confirm what personal data you may store."],
     ["quick_win", "Contract pack from a template", ["3"], "linguistic", 15, 25, "low", "Ask the AI to fill the template from the form answers.", "Legal still reviews the final text."],
     ["bigger_change", "Start the IT request at offer stage", ["2"], "strategic", 30, 60, "low", "Trigger the laptop and access request when the offer is accepted, not a week before.", "Offers can be withdrawn."],
     ["bigger_change", "Reusable first-week plan", ["4"], "cognitive", 25, 45, "low", "Keep a standard plan per role and adjust it in ten minutes.", "Managers must confirm their sessions."]],
    "A checklist that starts itself.", "A new starter turning up with no laptop."),
  ex("Customer Service", "Team member", "Customer complaint handling", "A complaint resolved and logged", 15, 0.5, null, "amber", [1, 3, 2, 1, 3, 0],
    [["Read and understand the complaint", "medium", "linguistic", "Long, emotional messages"], ["Find the order history", "high", "technical", "Two systems that do not link"], ["Decide the remedy", "high", "cognitive", "Policy is unclear on edge cases"], ["Write the reply", "high", "linguistic", "Hard to get the tone right"], ["Log the case", "low", "digital", "Quick"]],
    [["quick_win", "Summarise the complaint first", ["1"], "linguistic", 2, 4, "low", "Ask the AI for a three line summary and the customer's main ask.", "Read the original for anything sensitive."],
     ["quick_win", "Reply draft with tone options", ["4"], "linguistic", 4, 8, "low", "Ask the AI for a calm, short draft you edit and send.", "Never send without reading it."],
     ["bigger_change", "One-page remedy guide", ["3"], "cognitive", 3, 6, "low", "Write the top ten edge cases and their remedies in one page.", "Needs a team lead to agree the answers."],
     ["bigger_change", "Link order lookup to the case tool", ["2"], "technical", 4, 8, "medium", "Ask IT for a lookup button so the order history appears in the case.", "Depends on IT priorities."]],
    "Faster replies without losing the personal touch.", "Sending a reply that sounds cold or wrong."),
  ex("Procurement", "Buyer", "Purchase order approval", "An approved purchase order sent to the supplier", 4, 1, null, "green", [2, 1, 3, 2, 0, 0],
    [["Receive request", "low", "digital", "Requests arrive by email and chat"], ["Check budget", "medium", "technical", "Look up in a separate finance sheet"], ["Get approval", "high", "strategic", "Approver is away or not told"], ["Raise the order", "medium", "technical", "Retype the details into the system"]],
    [["quick_win", "One intake form for requests", ["1"], "digital", 5, 10, "low", "Ask requesters to use one form with the fields you always need.", "Some people will still email."],
     ["quick_win", "Delegate approval limits", ["3"], "strategic", 8, 20, "low", "Agree a backup approver for each limit so nothing waits on one person.", "Needs a policy change."],
     ["bigger_change", "Budget lookup in the order tool", ["2", "4"], "technical", 10, 20, "medium", "Ask IT to show the remaining budget when the order is raised.", "Needs IT and finance to agree on the data."]],
    "Requests that arrive complete.", "Approving something over budget by mistake.")
];

if (typeof module !== "undefined" && module.exports) module.exports = { parseResults: parseResults, validate: validate, slug: slug, LENSES: LENSES, LENS_KEYS: LENS_KEYS, addResult: addResult, aggregateTeam: aggregateTeam, EXAMPLE_TEAM: EXAMPLE_TEAM, CREDITS: CREDITS, compareResults: compareResults, sameWorkflow: sameWorkflow, makePreviousSample: makePreviousSample };

/* Example data, embedded so it works on file:// */
var SAMPLE = {
  "version": "1",
  "name": "",
  "department": "Compliance, Retail Banking",
  "role": "KYC analyst",
  "workflow": "KYC periodic review",
  "produces": "Approved customer risk reviews with an audit trail",
  "frequency_per_week": 5,
  "cycle_hours": 2.5,
  "cycle_hours_before": null,
  "workload": "amber",
  "friction": {
    "digital": 3,
    "cognitive": 3,
    "technical": 2,
    "strategic": 1,
    "linguistic": 1,
    "physical": 0
  },
  "steps": [
    {
      "id": "1",
      "name": "Pull the review list",
      "friction": "medium",
      "lens": "technical",
      "note": "Export from the core system, then clean the file in Excel before I can use it"
    },
    {
      "id": "2",
      "name": "Gather customer documents",
      "friction": "high",
      "lens": "digital",
      "note": "Documents sit in three systems, so I search each one for every customer"
    },
    {
      "id": "3",
      "name": "Run name screening",
      "friction": "high",
      "lens": "cognitive",
      "note": "Most screening hits are false matches, but each one needs a written reason"
    },
    {
      "id": "4",
      "name": "Check against the policy checklist",
      "friction": "high",
      "lens": "cognitive",
      "note": "Checklist changes after policy updates and I double check every item to be safe"
    },
    {
      "id": "5",
      "name": "Write the review memo",
      "friction": "medium",
      "lens": "linguistic",
      "note": "Same structure every time but I type it from scratch"
    },
    {
      "id": "6",
      "name": "Send for checker approval",
      "friction": "high",
      "lens": "strategic",
      "note": "Approvals sit in email for days and I chase them manually"
    },
    {
      "id": "7",
      "name": "Update records and tracker",
      "friction": "medium",
      "lens": "digital",
      "note": "Same details typed into the system and a side tracker"
    }
  ],
  "workarounds": [
    "Personal Excel tracker of reviews in progress",
    "Saved email templates for chasing approvals",
    "Printing the checklist and ticking by hand",
    "Asking a senior colleague about unclear policy points",
    "Keeping my own notes on common false screening matches"
  ],
  "fixes": [
    {
      "type": "quick_win",
      "title": "Memo template with fixed sections",
      "steps": [
        "5"
      ],
      "lens": "linguistic",
      "min_low": 10,
      "min_high": 15,
      "risk": "low",
      "what": "Build one Word template with the standard memo sections, and use Copilot to draft the wording from your checklist notes, with no customer names or IDs pasted in.",
      "catch": "Never paste customer data into AI unless your bank has approved it. Review every sentence before filing."
    },
    {
      "type": "quick_win",
      "title": "Excel cleanup in one click",
      "steps": [
        "1"
      ],
      "lens": "technical",
      "min_low": 5,
      "min_high": 10,
      "risk": "low",
      "what": "Record the cleanup steps once as a saved Power Query, so each new export is cleaned automatically.",
      "catch": "Check the row count matches the original export each time."
    },
    {
      "type": "quick_win",
      "title": "Reason codes for false screening matches",
      "steps": [
        "3"
      ],
      "lens": "cognitive",
      "min_low": 10,
      "min_high": 15,
      "risk": "medium",
      "what": "Agree a short list of standard reasons for common false matches with your team lead, and pick from it instead of writing each one fresh.",
      "catch": "Reason codes need compliance sign-off before use. Unusual hits still need a full written reason."
    },
    {
      "type": "bigger_change",
      "title": "Approval queue in Teams",
      "steps": [
        "6"
      ],
      "lens": "strategic",
      "min_low": 5,
      "min_high": 15,
      "risk": "medium",
      "what": "Move checker approvals from email into a shared approval flow, such as Teams Approvals, so pending items and their age are visible to everyone.",
      "catch": "The audit trail must still meet policy. Confirm with compliance and IT before switching."
    },
    {
      "type": "bigger_change",
      "title": "One document checklist per customer type",
      "steps": [
        "2",
        "4"
      ],
      "lens": "cognitive",
      "min_low": 10,
      "min_high": 20,
      "risk": "low",
      "what": "Turn the policy checklist into one short checklist per customer type, listing which system holds each document.",
      "catch": "Owner must update it on every policy change, or it becomes a risk instead of a help."
    },
    {
      "type": "bigger_change",
      "title": "Single source for review status",
      "steps": [
        "7"
      ],
      "lens": "digital",
      "min_low": 5,
      "min_high": 10,
      "risk": "medium",
      "what": "Retire the personal tracker by using one shared team list as the only place review status is updated.",
      "catch": "Needs the team to agree to update it every time, or status drifts again."
    }
  ],
  "need": "Reviews keep piling up at month end and I worry about missing deadlines the regulator expects.",
  "fear": "A shortcut that saves time but fails an audit, or customer data ending up somewhere it should not be."
};

/* ---------- Part 2: UI (browser only) ---------- */
if (typeof document !== "undefined") (function () {
  var KEY = "workflow-audit-results", TEAM_KEY = "workflow-audit-team", PREV_KEY = "workflow-audit-previous";
  Array.prototype.forEach.call(document.querySelectorAll("[data-credits]"), function (e) { e.textContent = CREDITS; });
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  // Safe element builder: values go in via textContent / text nodes, never innerHTML.
  function h(tag, p, kids) {
    var e = document.createElement(tag);
    for (var k in (p || {})) {
      if (k === "class") e.className = p[k];
      else if (k === "text") e.textContent = p[k];
      else if (k.slice(0, 2) === "on") e[k] = p[k];
      else e.setAttribute(k, p[k]);
    }
    (kids || []).forEach(function (c) { if (c != null) e.append(c); });
    return e;
  }
  function fmt(n) { var r = Math.round(n * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1); }
  function mins(n) { return String(Math.round(n)); }
  function safe(fn) { try { return fn(); } catch (e) { return null; } }
  var FR = { high: "High", medium: "Medium", low: "Low" };
  var typeLabel = function (t) { return t === "quick_win" ? "Quick win" : "Bigger change"; };
  function freqText(f) {
    if (f >= 1) return fmt(f) + (f === 1 ? " time" : " times") + " a week";
    var m = Math.max(1, Math.round(f * 52 / 12));
    return "about " + m + (m === 1 ? " time" : " times") + " a month";
  }

  /* ----- theme ----- */
  function effectiveTheme() {
    return document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  function syncThemeButtons() { $$('[data-act="theme"]').forEach(function (b) { b.textContent = effectiveTheme() === "dark" ? "Light mode" : "Dark mode"; }); }
  safe(function () { var t = localStorage.getItem("workflow-audit-theme"); if (t) document.documentElement.dataset.theme = t; });
  function toggleTheme() {
    var t = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    safe(function () { localStorage.setItem("workflow-audit-theme", t); });
    syncThemeButtons(); drawChart(); drawTeamChart();
  }

  /* ----- storage ----- */
  function save(data) { safe(function () { sessionStorage.setItem(KEY, JSON.stringify(data)); }); }
  function load() {
    var raw = safe(function () { return sessionStorage.getItem(KEY); });
    if (!raw) return null;
    var r = safe(function () { return validate(JSON.parse(raw)); });
    return r && r.ok ? r.data : null;
  }

  function savePrev(d) { safe(function () { sessionStorage.setItem(PREV_KEY, JSON.stringify(d)); }); }
  function clearPrev() { safe(function () { sessionStorage.removeItem(PREV_KEY); }); }
  function loadPrev() {
    var raw = safe(function () { return sessionStorage.getItem(PREV_KEY); });
    if (!raw) return null;
    var r = safe(function () { return validate(JSON.parse(raw)); });
    return r && r.ok ? r.data : null;
  }

  /* ----- routing ----- */
  var views = { landing: $("#landing"), dash: $("#dash"), team: $("#team") };
  function show(name) {
    Object.keys(views).forEach(function (k) { views[k].classList.toggle("hidden", k !== name); });
    window.scrollTo(0, 0);
    syncThemeButtons();
  }
  function route() {
    var hash = location.hash;
    if (hash === "#/example" || hash === "#/compare-example") {
      var ex = validate(SAMPLE);
      save(ex.data);
      if (hash === "#/compare-example") savePrev(makePreviousSample()); else clearPrev();
      history.replaceState(null, "", "#/results");
      hash = "#/results";
    }
    if (hash === "#/results") {
      var d = load();
      if (d) { closeCmpPanel(); prev = loadPrev(); show("dash"); render(d); return; }
      history.replaceState(null, "", "#/");
    }
    if (hash === "#/team-example") {
      team = EXAMPLE_TEAM.reduce(function (l, e) { return addResult(l, JSON.stringify(e)).list; }, []);
      saveTeam(); notes = [];
      history.replaceState(null, "", "#/team");
      hash = "#/team";
    }
    if (hash === "#/team") { show("team"); renderTeam(); return; }
    show("landing");
  }
  window.addEventListener("hashchange", route);

  /* ----- landing ----- */
  var copyBtn = $("#copy"), paste = $("#paste"), errBox = $("#err");
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) { // file:// is not a secure context, so the modern API is missing there
    var t = h("textarea", { style: "position:fixed;opacity:0;top:0;left:0" });
    t.value = text; document.body.append(t); t.select();
    var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
    t.remove(); return ok;
  }
  var copyTimer;
  copyBtn.onclick = function () {
    var p = window.AUDIT_PROMPT;
    function flash(msg) { copyBtn.textContent = msg; clearTimeout(copyTimer); copyTimer = setTimeout(function () { copyBtn.textContent = "Copy prompt"; }, 2000); }
    if (typeof p !== "string" || !p) { flash("Prompt not loaded"); return; }
    copyText(p).then(function (ok) { flash(ok ? "Copied" : "Could not copy"); });
  };
  function showErr(msg) { errBox.textContent = msg; errBox.classList.toggle("hidden", !msg); }
  paste.oninput = function () { showErr(""); };
  $("#go").onclick = function () {
    var r = parseResults(paste.value);
    if (!r.ok) { showErr(r.error); return; }
    showErr(""); save(r.data); clearPrev(); location.hash = "#/results";
  };
  $("#example").onclick = function () { location.hash = "#/example"; };

  /* ----- dashboard ----- */
  var R, fixes, state, chart, io, prev = null, cmp = null;

  function card(cls, id, title, sub) {
    return h("section", { class: "card " + cls, id: id }, [h("h2", { text: title }), h("p", { class: "sub", text: sub })]);
  }
  function kpi(label, valKids, foot) {
    return h("div", { class: "card kpi" }, [h("div", { class: "lab", text: label }), h("div", { class: "val num" }, valKids), h("div", { class: "foot" }, Array.isArray(foot) ? foot : [foot])]);
  }
  var unit = function (t) { return h("small", { text: " " + t }); };
  var stepOf = function (id) { return R.steps.filter(function (s) { return s.id === id; })[0]; };

  function render(data) {
    R = data;
    fixes = R.fixes.map(function (f, i) { return Object.assign({ i: i }, f); });
    state = { sel: null, tab: "all", picked: new Set(fixes.filter(function (f) { return f.type === "quick_win"; }).map(function (f) { return f.i; })) };
    cmp = prev ? compareResults(prev, R) : null;
    build(); renderBanner(); renderSel(); renderFixes(); renderPlan(); drawChart();
  }

  // change text: goodDown true = down is good (green), false = up is good, null = neutral
  function delta(d, u, goodDown, prefix) {
    if (!d) return h("span", { class: "delta", text: "no change" });
    var good = goodDown === null ? "" : (d < 0) === goodDown ? " good" : " bad";
    return h("span", { class: "delta" + good, text: (prefix || "") + (d < 0 ? "down " : "up ") + fmt(Math.abs(d)) + (u ? " " + u : "") });
  }
  var rng = function (o) { return fmt(o.lo) + " to " + fmt(o.hi) + " h"; };

  function renderBanner() {
    var b = $("#cmp-banner"); b.textContent = "";
    if (!cmp) return;
    b.append(h("div", { class: "cmp-banner" }, [
      h("div", {}, [h("b", { text: "Comparing with your previous result" }), " ", h("span", { text: prev.workflow })]),
      h("button", { type: "button", class: "btn", text: "Stop comparing", onclick: stopCompare })]));
  }
  function stopCompare() { prev = null; clearPrev(); render(R); }
  function startCompare(p) { prev = p; savePrev(p); closeCmpPanel(); render(R); window.scrollTo(0, 0); }

  /* compare panel: pick one file, validate, warn if it is a different workflow */
  var cmpPanel = $("#cmp-panel");
  function closeCmpPanel() { cmpPanel.classList.add("hidden"); cmpPanel.textContent = ""; }
  function openCmpPanel() { renderCmpPanel({}); cmpPanel.classList.remove("hidden"); window.scrollTo(0, 0); }
  function renderCmpPanel(o) {
    cmpPanel.textContent = "";
    var c = card("", "cmp-card", "Compare with a previous result", "Choose the results file you downloaded last time. It is read in this browser only.");
    if (o.pending) {
      c.append(h("p", { class: "warn", role: "alert", text: "That file is for \u201c" + o.pending.workflow + "\u201d, but this dashboard is for \u201c" + R.workflow + "\u201d. Comparing different workflows may not mean much." }),
        h("div", { class: "row-actions" }, [
          h("button", { type: "button", class: "btn pri", text: "Compare anyway", onclick: function () { startCompare(o.pending); } }),
          h("button", { type: "button", class: "btn", text: "Cancel", onclick: closeCmpPanel })]));
    } else {
      var input = h("input", { type: "file", accept: ".json,application/json", class: "hidden", "aria-label": "Choose a previous results file" });
      input.onchange = function () { if (input.files.length) handleCmpFile(input.files[0]); input.value = ""; };
      var dz = h("div", { class: "dz" }, [h("p", { text: "Drop one results file here (.json), or choose it from your device." }),
        h("div", { class: "row-actions" }, [
          h("button", { type: "button", class: "btn pri", text: "Choose file", onclick: function () { input.click(); } }),
          h("button", { type: "button", class: "btn", text: "Cancel", onclick: closeCmpPanel })])]);
      ["dragenter", "dragover"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("over"); }); });
      ["dragleave", "drop"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("over"); }); });
      dz.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files.length) handleCmpFile(e.dataTransfer.files[0]); });
      c.append(dz, input);
      if (o.error) c.append(h("p", { class: "err", role: "alert", style: "margin-top:12px", text: o.error }));
    }
    cmpPanel.append(c);
  }
  function handleCmpFile(f) {
    readFile(f).then(function (r) {
      if (r.text === null) { renderCmpPanel({ error: f.name + ": could not be read." }); return; }
      var p = parseResults(r.text);
      if (!p.ok) { renderCmpPanel({ error: f.name + ": " + p.error.replace(/ Ask the AI: json again$/, "") + "." }); return; }
      if (sameWorkflow(p.data, R)) startCompare(p.data); else renderCmpPanel({ pending: p.data });
    });
  }

  function build() {
    var wf = R.workflow, perWeek = R.cycle_hours * R.frequency_per_week;
    document.title = wf + " - Workflow audit results";
    var who = $("#who"); who.textContent = "";
    who.append(h("small", { text: "Workflow" }), h("b", { text: wf }));
    if (R.name) who.append(h("span", { text: R.name }));
    if (R.department) who.append(h("span", { text: R.department }));

    var top = $("#top"); top.textContent = "";
    var bits = [R.name, R.role, R.department].filter(Boolean).join(", ");
    top.append(h("h1", { text: wf }), h("p", { text: [R.produces, bits, freqText(R.frequency_per_week) + ", about " + fmt(perWeek) + " h a week"].filter(Boolean).join(". ") + "." }));

    var nav = $("#nav"); nav.textContent = "";
    [["kpis", "Overview"], ["friction", "Friction profile"], ["map", "Workflow map"], ["planner", "What-if planner"], ["fixes", "Fixes"], ["words", "In your words"]].forEach(function (n) {
      nav.append(h("a", { href: "#/results", "data-go": n[0], text: n[1], onclick: function (e) { e.preventDefault(); var t = document.getElementById(n[0]); t && t.scrollIntoView({ behavior: "smooth" }); } }));
    });

    var g = $("#grid"); g.textContent = "";
    var sumLo = fixes.reduce(function (a, f) { return a + f.min_low; }, 0), sumHi = fixes.reduce(function (a, f) { return a + f.min_high; }, 0);
    var wkLo = sumLo / 60 * R.frequency_per_week, wkHi = sumHi / 60 * R.frequency_per_week;
    var highCount = R.steps.filter(function (s) { return s.friction === "high"; }).length;

    var kpis;
    if (cmp) {
      kpis = [
        kpi("Hours per cycle now", [fmt(R.cycle_hours), unit("h")], [fmt(cmp.cycle.prev) + " h \u2192 " + fmt(cmp.cycle.now) + " h. ", delta(cmp.cycle.delta, "h", true)]),
        kpi("Hours savable per week", [fmt(wkLo) + " to " + fmt(wkHi), unit("h")], ["Was " + rng(cmp.savable.prev) + ". ", delta(cmp.savable.deltaHigh, "h", null, "top end ")]),
        kpi("Painful steps", [String(highCount), unit("of " + R.steps.length)], [cmp.painful.prev + " \u2192 " + cmp.painful.now + ". ", delta(cmp.painful.delta, cmp.painful.delta === 1 || cmp.painful.delta === -1 ? "step" : "steps", true)]),
        kpi("Workload", [h("span", { class: "pill " + R.workload, text: R.workload })], [cmp.workload.prev + " \u2192 " + cmp.workload.now + ". ",
          h("span", { class: "delta" + (cmp.workload.change === "better" ? " good" : cmp.workload.change === "worse" ? " bad" : ""), text: cmp.workload.change === "same" ? "no change" : cmp.workload.change === "better" ? "lighter" : "heavier" })])
      ];
    } else {
      kpis = [
        kpi("Hours per cycle now", [fmt(R.cycle_hours), unit("h")], R.cycle_hours_before !== null ? "Was " + fmt(R.cycle_hours_before) + " h before" : freqText(R.frequency_per_week)),
        kpi("Hours savable per week", [fmt(wkLo) + " to " + fmt(wkHi), unit("h")], "If all " + fixes.length + " fixes land, " + freqText(R.frequency_per_week)),
        kpi("Painful steps", [String(highCount), unit("of " + R.steps.length)], "High friction steps"),
        kpi("Workload", [h("span", { class: "pill " + R.workload, text: R.workload })], "Self-reported")
      ];
    }
    var kp = h("div", { id: "kpis", style: "display:contents" }, kpis);
    g.append(kp);

    // radar
    var rc = card("c-radar", "friction", "Friction profile", "Six lenses, scored 0 (none) to 3 (severe)");
    rc.append(h("div", { class: "radar-wrap" }, [h("canvas", { id: "radar", role: "img", "aria-label": "Radar chart of friction scores" })]));
    if (cmp) rc.append(h("div", { class: "key" }, [h("span", {}, [h("i", { class: "ln dash" }), "Previous"]), h("span", {}, [h("i", { class: "ln" }), "Now"])]));
    rc.append(h("ul", { class: "legend" }, LENS_KEYS.map(function (k) { return h("li", {}, [h("span", { text: LENSES[k] }), h("b", { class: "num", text: cmp ? cmp.friction[k].prev + " \u2192 " + cmp.friction[k].now : String(R.friction[k]) })]); })));
    g.append(rc);

    // map
    var mc = card("c-map", "map", "Workflow map", "Select a step to see its note and filter the fixes");
    var sg = h("div", { class: "steps" });
    R.steps.forEach(function (s) {
      sg.append(h("button", { type: "button", class: "step " + s.friction, "data-id": s.id, "aria-pressed": "false",
        onclick: function () { state.sel = state.sel === s.id ? null : s.id; renderSel(); renderFixes(); } },
        [h("small", {}, ["Step " + s.id, cmpTag(s.id)]), h("span", { text: s.name })]));
    });
    mc.append(sg);
    mc.append(h("div", { class: "key" }, ["high", "medium", "low"].map(function (k) {
      return h("span", {}, [h("i", { style: "background:var(--" + (k === "high" ? "red" : k === "medium" ? "amber" : "green") + ")" }), FR[k] + " friction"]);
    })));
    if (cmp && cmp.removed.length) {
      mc.append(h("p", { class: "rm-note", text: "Removed since your previous result" }));
      mc.append(h("ul", { class: "work" }, cmp.removed.map(function (r) { return h("li", { text: r.name + " (was " + r.friction + " friction)" }); })));
    }
    mc.append(h("div", { class: "detail", id: "detail" }));
    g.append(mc);

    // planner
    var pc = card("c-plan", "planner", "What-if planner", "Tick fixes to estimate time per cycle and per week");
    var checks = h("div", { class: "checks" });
    fixes.forEach(function (f) {
      var cb = h("input", { type: "checkbox" }); cb.checked = state.picked.has(f.i);
      cb.onchange = function () { if (cb.checked) state.picked.add(f.i); else state.picked["delete"](f.i); renderPlan(); };
      checks.append(h("label", { class: "chk" }, [cb,
        h("div", {}, [h("div", { class: "t", text: f.title }), h("div", { class: "m", text: typeLabel(f.type) + (f.steps.length ? ", " + (f.steps.length > 1 ? "steps " : "step ") + f.steps.join(", ") : "") })]),
        h("span", { class: "mins num", text: mins(f.min_low) + " to " + mins(f.min_high) + " min" })]));
    });
    function big(label, id) { return h("div", {}, [h("small", { text: label }), h("b", { class: "num", id: id }), h("br"), h("em", { id: id + "2" })]); }
    function bar(label, vid, fills) { return h("div", { class: "bar" }, [h("div", { class: "row" }, [h("span", { text: label }), h("span", { class: "num", id: vid })]), h("div", { class: "track" }, fills)]); }
    var out = h("div", { class: "out" }, [
      h("div", { class: "big" }, [big("Per cycle", "o-vid"), big("Saved per week", "o-wk")]),
      h("div", { class: "bars" }, [
        bar("Today", "b-now", [h("div", { class: "fill now", id: "f-now" })]),
        bar("With selected fixes", "b-new", [h("div", { class: "fill rng", id: "f-rng" }), h("div", { class: "fill new", id: "f-new" })])
      ]),
      h("p", { class: "note", text: "Estimates add each fix on its own. Fixes touching the same step may overlap, so treat the low end as safer." })
    ]);
    pc.append(h("div", { class: "plan" }, [checks, out]));
    g.append(pc);

    // fixes
    var fc = card("c-fix", "fixes", "Fixes", "Expand a row for what to do and what to watch for");
    var tabs = h("div", { class: "tabs", role: "tablist" });
    [["all", "All"], ["quick_win", "Quick wins"], ["bigger_change", "Bigger changes"]].forEach(function (t) {
      tabs.append(h("button", { type: "button", class: "tab", role: "tab", "data-k": t[0], text: t[1], onclick: function () { state.tab = t[0]; renderFixes(); } }));
    });
    fc.append(h("div", {}, [tabs, h("span", { id: "chiphost" })]), h("div", { id: "fxlist" }));
    g.append(fc);

    // words
    var wc = card("c-words", "words", "In your words", "What you said you need and fear");
    wc.append(h("div", { class: "words" }, [
      h("div", {}, [h("h3", { text: "Need" }), h("blockquote", { text: R.need || "Not given" })]),
      h("div", {}, [h("h3", { text: "Fear" }), h("blockquote", { class: "f", text: R.fear || "Not given" })])
    ]));
    if (R.workarounds.length) {
      wc.append(h("div", { class: "note", text: "Workarounds you use today" }));
      wc.append(h("ul", { class: "work" }, R.workarounds.map(function (w) { return h("li", { text: w }); })));
    }
    g.append(wc);

    // nav highlight
    if (io) io.disconnect();
    var links = $$("#nav a");
    io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) links.forEach(function (a) { a.classList.toggle("on", a.dataset.go === e.target.id); }); });
    }, { rootMargin: "-30% 0px -60% 0px" });
    links.forEach(function (a) { var t = document.getElementById(a.dataset.go); t && io.observe(t); });
  }

  var TAGS = { calmer: "Calmer", worse: "Worse", same: "Same", "new": "New" };
  function cmpOf(id) { return cmp ? cmp.steps.filter(function (x) { return x.id === id; })[0] : null; }
  function cmpTag(id) { var c = cmpOf(id); return c ? h("span", { class: "tag " + c.status, text: TAGS[c.status] }) : null; }

  function renderSel() {
    $$(".step").forEach(function (b) { var on = b.dataset.id === state.sel; b.classList.toggle("sel", on); b.setAttribute("aria-pressed", String(on)); });
    var d = $("#detail"), s = stepOf(state.sel); d.textContent = "";
    if (!s) { d.textContent = "No step selected. Pick one to read its note."; return; }
    d.append(h("b", { text: "Step " + s.id + ": " + s.name }), " ", h("span", { class: "badge " + s.friction, text: FR[s.friction] + " friction" }),
      h("div", { style: "margin-top:6px", text: s.note || "No note for this step." }),
      h("div", { class: "note", style: "margin-top:6px", text: "Main friction: " + LENSES[s.lens] }),
      cmpOf(s.id) ? h("div", { class: "note", style: "margin-top:6px", text: cmpOf(s.id).prevFriction ? "Compared with previous: " + TAGS[cmpOf(s.id).status] + " (was " + FR[cmpOf(s.id).prevFriction].toLowerCase() + " friction)" : "Compared with previous: New step" }) : null);
  }

  function renderFixes() {
    $$(".tab").forEach(function (t) { t.setAttribute("aria-selected", String(t.dataset.k === state.tab)); });
    var ch = $("#chiphost"); ch.textContent = "";
    if (state.sel) ch.append(h("button", { type: "button", class: "chip", text: "Step " + state.sel + ": " + stepOf(state.sel).name + " ×", onclick: function () { state.sel = null; renderSel(); renderFixes(); } }));
    var list = fixes.filter(function (f) { return (state.tab === "all" || f.type === state.tab) && (!state.sel || f.steps.indexOf(state.sel) !== -1); });
    var host = $("#fxlist"); host.textContent = "";
    if (!list.length) host.append(h("div", { class: "empty", text: "No fixes match this filter." }));
    list.forEach(function (f) {
      host.append(h("details", { class: "fx" }, [
        h("summary", {}, [h("span", { class: "tt", text: f.title }),
          h("span", { class: "sp" }, [h("span", { text: typeLabel(f.type) }), h("span", { class: "num", text: mins(f.min_low) + " to " + mins(f.min_high) + " min" }), h("span", { class: "badge " + f.risk, text: f.risk + " risk" })])]),
        h("div", { class: "body" }, [
          h("div", {}, [h("h3", { text: "What" }), h("p", { text: f.what || "No detail given." })]),
          h("div", {}, [h("h3", { text: "Catch" }), h("p", { text: f.catch || "No catch given." })]),
          h("div", { style: "grid-column:1/-1" }, [h("h3", { text: "Friction lens" }), h("p", { text: LENSES[f.lens] + (f.steps.length ? ". Steps: " + f.steps.map(function (id) { return stepOf(id).name; }).join(", ") : "") })])
        ])]));
    });
  }

  function renderPlan() {
    var lo = 0, hi = 0;
    state.picked.forEach(function (i) { lo += fixes[i].min_low; hi += fixes[i].min_high; });
    var base = R.cycle_hours, fq = R.frequency_per_week, none = !state.picked.size;
    var best = Math.max(0, base - hi / 60), worst = Math.max(0, base - lo / 60), mid = (best + worst) / 2;
    var set = function (id, t) { $("#" + id).textContent = t; };
    set("o-vid", none ? fmt(base) + " h" : fmt(best) + " to " + fmt(worst) + " h");
    set("o-vid2", none ? "No fixes selected" : "down from " + fmt(base) + " h");
    set("o-wk", none ? "0 h" : fmt(lo / 60 * fq) + " to " + fmt(hi / 60 * fq) + " h");
    set("o-wk2", freqText(fq));
    set("b-now", fmt(base) + " h");
    set("b-new", none ? fmt(base) + " h" : fmt(mid) + " h, range " + fmt(best) + " to " + fmt(worst));
    var max = Math.max(base, R.cycle_hours_before || 0) || 1, w = function (x) { return (x / max * 100) + "%"; };
    $("#f-now").style.width = w(base);
    $("#f-new").style.width = w(none ? base : best);
    $("#f-rng").style.width = w(none ? base : worst);
  }

  function wrap(label, n) {
    return label.split(" ").reduce(function (a, word) { var l = a[a.length - 1]; if ((l + " " + word).trim().length > n) a.push(word); else a[a.length - 1] = (l + " " + word).trim(); return a; }, [""]);
  }
  function drawChart() {
    var cv = $("#radar");
    if (!cv || !R) return;
    if (typeof Chart === "undefined") { cv.replaceWith(h("div", { class: "empty", text: "The chart could not load. The scores are listed below." })); return; }
    if (chart) chart.destroy();
    var cs = getComputedStyle(document.documentElement), css = function (n) { return cs.getPropertyValue(n).trim(); };
    var ink2 = css("--ink2"), grid = css("--grid"), acc = css("--accent");
    chart = new Chart(cv, {
      type: "radar",
      data: { labels: LENS_KEYS.map(function (k) { return wrap(LENSES[k], 14); }), datasets: (cmp ? [{ label: "Previous", data: LENS_KEYS.map(function (k) { return prev.friction[k]; }),
        borderColor: css("--ink3"), backgroundColor: "transparent", borderDash: [6, 4], pointBackgroundColor: css("--ink3"), pointBorderColor: css("--card"), borderWidth: 2, pointRadius: 3 }] : []).concat([{ label: "Now", data: LENS_KEYS.map(function (k) { return R.friction[k]; }),
        borderColor: acc, backgroundColor: acc + "33", pointBackgroundColor: acc, pointBorderColor: css("--card"), borderWidth: 2, pointRadius: 3.5 }]) },
      options: { maintainAspectRatio: false, layout: { padding: { top: 10, bottom: 10, left: 18, right: 18 } }, animation: { duration: 700 },
        scales: { r: { min: 0, max: 3, ticks: { stepSize: 1, color: ink2, backdropColor: "transparent", font: { family: "Inter, system-ui, sans-serif", size: 10 } },
          grid: { color: grid }, angleLines: { color: grid }, pointLabels: { color: ink2, font: { family: "Inter, system-ui, sans-serif", size: 11 } } } },
        plugins: { legend: { display: false } } }
    });
  }

  function download() {
    var a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(R, null, 2)], { type: "application/json" })), download: "workflow-audit-" + slug(R.workflow) + ".json" });
    document.body.append(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }


  /* ----- team view ----- */
  var team = [], notes = [], teamChart;
  (function () {
    var raw = safe(function () { return JSON.parse(sessionStorage.getItem(TEAM_KEY)); });
    if (Array.isArray(raw)) team = raw.reduce(function (l, d) { return addResult(l, JSON.stringify(d)).list; }, []);
  })();
  function saveTeam() { safe(function () { sessionStorage.setItem(TEAM_KEY, JSON.stringify(team)); }); }

  function readFile(f) {
    return new Promise(function (res) {
      var fr = new FileReader();
      fr.onload = function () { res({ name: f.name, text: String(fr.result) }); };
      fr.onerror = function () { res({ name: f.name, text: null }); };
      fr.readAsText(f);
    });
  }
  function loadFiles(files) {
    Promise.all(Array.prototype.map.call(files, readFile)).then(function (all) {
      notes = [];
      all.forEach(function (f) {
        if (f.text === null) { notes.push({ bad: true, text: f.name + ": could not be read, skipped." }); return; }
        var r = addResult(team, f.text);
        if (r.status === "added") team = r.list;
        else if (r.status === "duplicate") notes.push({ text: f.name + ": already loaded, skipped." });
        else notes.push({ bad: true, text: f.name + ": " + r.error.replace(/ Ask the AI: json again$/, "") + ". Skipped." });
      });
      saveTeam(); renderTeam();
    });
  }
  var n1 = function (n, one, many) { return n + " " + (n === 1 ? one : many); };

  function renderTeam() {
    var A = aggregateTeam(team), g = $("#t-grid");
    g.textContent = "";
    $("#t-who").textContent = "";
    $("#t-who").append(h("small", { text: "Combined" }), h("b", { text: "Team view" }), h("span", { text: n1(A.n, "result", "results") + " loaded" }));
    $("#t-top").textContent = "";
    $("#t-top").append(h("h1", { text: "Team view" }), h("p", { text: "Combine the results files your team downloaded. Everything stays in this browser." }));

    // load card
    var input = h("input", { type: "file", multiple: "", accept: ".json,application/json", class: "hidden", "aria-label": "Choose results files" });
    input.onchange = function () { if (input.files.length) loadFiles(input.files); input.value = ""; };
    var dz = h("div", { class: "dz" }, [h("p", { text: "Drop results files here (.json), or choose them from your device." }),
      h("div", { class: "row-actions" }, [
        h("button", { type: "button", class: "btn pri", text: "Choose files", onclick: function () { input.click(); } }),
        h("button", { type: "button", class: "btn", text: "Load example team", onclick: function () { location.hash = "#/team-example"; } })])]);
    ["dragenter", "dragover"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("over"); }); });
    dz.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files.length) loadFiles(e.dataTransfer.files); });
    var lc = card("c-load", "t-load", "Results loaded", "Files are read in this browser and never uploaded");
    lc.append(dz, input);
    if (notes.length) lc.append(h("ul", { class: "t-notes", role: "status" }, notes.map(function (n) { return h("li", { class: n.bad ? "bad" : "", text: n.text }); })));
    if (team.length) {
      lc.append(h("ul", { class: "loaded" }, team.map(function (d, i) {
        var meta = [d.department, d.role].filter(Boolean).join(", ");
        if (d.name) meta += (meta ? ", " : "") + d.name;
        return h("li", {}, [h("div", {}, [h("div", { class: "t", text: d.workflow }), h("div", { class: "m", text: meta || "No department given" })]),
          h("button", { type: "button", class: "btn rm", text: "Remove", "aria-label": "Remove " + d.workflow, onclick: function () { team.splice(i, 1); notes = []; saveTeam(); renderTeam(); } })]);
      })));
    }
    g.append(lc);

    var nav = [["t-load", "Results loaded"]];
    if (A.n) {
      var kp = h("div", { id: "t-kpis", style: "display:contents" }, [
        kpi("People loaded", [String(A.n)], A.n === 1 ? "One result file" : "Result files combined"),
        kpi("Hours per week on these workflows", [fmt(A.hoursPerWeek), unit("h")], "Cycle hours times how often, summed"),
        kpi("Hours savable per week", [fmt(A.savableLow) + " to " + fmt(A.savableHigh), unit("h")], "If every suggested fix lands"),
        kpi("Steps rated high friction", [String(Math.round(A.highShare * 100)), h("small", { text: "%" })], A.highSteps + " of " + A.steps + " steps")
      ]);
      g.append(kp);

      var fc = card("c-tl", "t-friction", "Average friction by lens", "Mean score across the team, 0 (none) to 3 (severe)");
      fc.append(h("div", { class: "bars-h radar-wrap" }, [h("canvas", { id: "tbars", role: "img", "aria-label": "Bar chart of average friction by lens" })]));
      g.append(fc);

      var maxC = Math.max.apply(null, A.lensHigh.map(function (l) { return l.count; })) || 1;
      var cc = card("c-tr", "t-clusters", "Where high friction clusters", "High friction steps per lens");
      cc.append(h("ul", { class: "cl" }, A.lensHigh.map(function (l) {
        return h("li", {}, [h("div", { class: "row" }, [h("span", { text: l.label }), h("b", { class: "num", text: String(l.count) })]),
          h("div", { class: "track" }, [h("div", { class: "fill new", style: "width:" + (l.count / maxC * 100) + "%" })])]);
      })));
      g.append(cc);

      var tc = card("c-fix", "t-fixes", "Top fixes across the team", "Ranked by the most minutes they could save per week");
      tc.append(h("ol", { class: "tf" }, A.topFixes.map(function (f) {
        return h("li", {}, [h("div", {}, [h("div", { class: "t", text: f.title }),
            h("div", { class: "m", text: typeLabel(f.type) + ", " + f.risk + " risk. " + f.workflow + (f.department ? ", " + f.department : "") })]),
          h("div", { class: "v num", text: mins(f.weekLow) + " to " + mins(f.weekHigh) + " min a week" })]);
      })));
      g.append(tc);

      var wc = card("c-fix", "t-workload", "Workload", "How people rate their load, as a count");
      if (A.workload) wc.append(h("div", { class: "wl" }, ["green", "amber", "red"].map(function (k) { return h("div", {}, [h("span", { class: "pill " + k, text: k }), h("b", { class: "num", text: String(A.workload[k]) })]); })));
      else wc.append(h("p", { class: "wl-note", text: "Workload is shown once 5 or more results are loaded, to protect privacy." }));
      g.append(wc);
      nav.push(["t-kpis", "Overview"], ["t-friction", "Friction by lens"], ["t-clusters", "Friction clusters"], ["t-fixes", "Top fixes"], ["t-workload", "Workload"]);
    }
    var tn = $("#t-nav"); tn.textContent = "";
    nav.forEach(function (n) {
      tn.append(h("a", { href: "#/team", text: n[1], onclick: function (e) { e.preventDefault(); var t = document.getElementById(n[0]); t && t.scrollIntoView({ behavior: "smooth" }); } }));
    });
    drawTeamChart();
  }

  function drawTeamChart() {
    var cv = $("#tbars");
    if (!cv || !team.length) return;
    if (typeof Chart === "undefined") { cv.replaceWith(h("div", { class: "empty", text: "The chart could not load." })); return; }
    if (teamChart) teamChart.destroy();
    var A = aggregateTeam(team), cs = getComputedStyle(document.documentElement), css = function (n) { return cs.getPropertyValue(n).trim(); };
    teamChart = new Chart(cv, {
      type: "bar",
      data: { labels: LENS_KEYS.map(function (k) { return wrap(LENSES[k], 20); }), datasets: [{ data: LENS_KEYS.map(function (k) { return Math.round(A.lensAvg[k] * 10) / 10; }), backgroundColor: css("--accent"), borderRadius: 4, barThickness: 18 }] },
      options: { indexAxis: "y", maintainAspectRatio: false, animation: { duration: 600 },
        scales: { x: { min: 0, max: 3, ticks: { stepSize: 1, color: css("--ink2"), font: { family: "Inter, system-ui, sans-serif", size: 11 } }, grid: { color: css("--grid") } },
          y: { ticks: { color: css("--ink2"), font: { family: "Inter, system-ui, sans-serif", size: 11 } }, grid: { display: false } } },
        plugins: { legend: { display: false } } }
    });
  }

  /* ----- wiring ----- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var act = b.dataset.act;
    if (act === "dl" && R) download(); else if (act === "compare" && R) openCmpPanel(); else if (act === "pdf") window.print(); else if (act === "theme") toggleTheme();
  });
  var wasOpen = [];
  window.addEventListener("beforeprint", function () {
    wasOpen = $$("details.fx").map(function (d) { return d.open; });
    $$("details.fx").forEach(function (d) { d.open = true; });
    // print layout is narrower than the screen canvas, so print a snapshot image instead of the live chart
    [[chart, 320, 320], [teamChart, 520, 300]].forEach(function (c) {
      if (!c[0] || !c[0].canvas.isConnected) return;
      c[0].stop(); c[0].resize(c[1], c[2]); c[0].update("none");
      c[0].canvas.after(h("img", { class: "radar-print", alt: "Chart", src: c[0].toBase64Image() }));
    });
  });
  window.addEventListener("afterprint", function () { $$("details.fx").forEach(function (d, i) { d.open = !!wasOpen[i]; }); $$(".radar-print").forEach(function (i) { i.remove(); }); chart && chart.resize(); teamChart && teamChart.resize(); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () { syncThemeButtons(); drawChart(); drawTeamChart(); });

  route();
})();
