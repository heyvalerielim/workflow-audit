# Results format v1

The AI prints this as one JSON object inside a ```json code block at the end of the interview.
The site reads it. The Team tab combines many of them. Keep field names exact.

```json
{
  "version": "1",
  "name": "",
  "department": "Finance Ops",
  "role": "Senior executive",
  "workflow": "Monthly expense claims",
  "produces": "Approved claims sent to payroll",
  "frequency_per_week": 1,
  "cycle_hours": 3,
  "cycle_hours_before": null,
  "workload": "amber",
  "friction": {"digital": 2, "cognitive": 3, "technical": 1, "strategic": 1, "linguistic": 0, "physical": 0},
  "steps": [
    {"id": "1", "name": "Download receipts", "friction": "high", "lens": "digital", "note": "Hunting through email every time"}
  ],
  "workarounds": ["Side spreadsheet to track approvals"],
  "fixes": [
    {"type": "quick_win", "title": "Auto-extract receipt amounts", "steps": ["1"], "lens": "digital",
     "min_low": 15, "min_high": 30, "risk": "low",
     "what": "One or two sentences on what to do.", "catch": "One sentence on what to double-check."}
  ],
  "need": "In their own words.",
  "fear": "In their own words."
}
```

## Rules
| Field | Allowed values |
|---|---|
| `version` | "1" |
| `name` | text, may be "" (optional) |
| `frequency_per_week` | number > 0 (monthly = 0.25, daily = 5) |
| `cycle_hours` | hours for one full cycle, number |
| `cycle_hours_before` | number or null (only if they mention an earlier, slower version) |
| `workload` | "green" \| "amber" \| "red" |
| `friction` | exactly these 6 keys, each integer 0 to 3: digital, cognitive, technical, strategic, linguistic, physical |
| `steps` | 1 to 7 items; `friction` is "high" \| "medium" \| "low"; `lens` is one of the 6 keys; `note` ≤ 20 words |
| `workarounds` | 0 to 8 short strings |
| `fixes` | 1 to 6 items, at most 3 per `type`; `type` is "quick_win" \| "bigger_change"; `steps` lists step ids; `min_low`/`min_high` are minutes saved PER CYCLE (integers); `risk` is "low" \| "medium" \| "high" |
| `need`, `fear` | ≤ 40 words each |

## Lens labels (display text)
| Key | Label |
|---|---|
| digital | Moving files and app switching |
| cognitive | Mental load and checking |
| technical | Tools not talking to each other |
| strategic | Steps in the wrong order |
| linguistic | Language and communication |
| physical | Device, space and storage |
