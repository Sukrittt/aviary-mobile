# Effortless logging

Plan · drafted 2026-09-26 · status: planning

## Problem

Aviary is only as useful as what gets logged, and logging every spend by hand is a habit most
people never build. The user we're designing for pays all day (UPI, card, cash) and wants to open
the app about once a week to see the dashboard and insights. They won't log each expense.

Constraints we've settled on:

- **No bank linking.** Partnering with banks isn't realistic, and people won't connect their bank
  to a small app. Account Aggregator needs a regulated entity (RBI, SEBI, IRDAI or PFRDA).
- **No SMS reading.** It's a restricted Play permission with uncertain approval, and it can't work
  on web.
- **No Gmail parsing.** A restricted scope with a yearly paid security assessment.
- **No push notification after each spend.**
- **Must work the same on Android and web.**

## Goals

- A normal day takes under 30 seconds to log. A missed week takes under 2 minutes to catch up.
- Dashboard **totals stay right** even when the user forgets things. Categories are mostly right.
- Manual logging stays the default and doesn't get any worse.

## Non-goals

- SMS, bank linking, Gmail, reading other apps' notifications, per-spend nudges.
- Turning the app into a chat app. The Brain handles capture and questions. Existing screens keep
  doing what buttons do well (checking envelopes, moving money, editing budgets).

## Principles

1. **Recognize, don't recall.** People forget small spends when asked "what did you spend today?"
   They're good at confirming a list. Show likely spends and let them tick and edit.
2. **The AI proposes, the app commits.** The model never writes to the database. It returns a
   proposal, the app shows a review card, and Submit goes through the existing endpoints.
3. **Totals first.** A weekly balance check catches what recall misses, so totals are always right.
4. **Skipping costs nothing.** No guilt piles. A missed day or week is one quick catch-up.
5. **The AI allowance never blocks logging.** If logging stops working mid-month, the habit breaks.

## How it fits together

```
 Inputs                          Brain (server)                  App
 ──────                          ──────────────                  ───
 Typed text      ─┐
 Voice note      ─┼─► Jev router ─► capture route ─► proposal ─► Review card ─► POST /api/expenses
 Screenshot(s)   ─┘     (isCapture)  (structured output)          (edit, delete,   (offline queue,
                                                                   split, submit)   client_id, conflicts)
 Routine profile ────────────────────────────────────────────► Today card (no AI call)
 Weekly balance  ────────────────────────────────────────────► Gap card ─► same review card
```

## The pieces

### 1. Routine profile ("About you")

A structured list of the user's usual spends, not a paragraph stuffed into a prompt.

| Field | Example |
|---|---|
| label | Office commute |
| category | Travel |
| kind | `fixed` · `routine` |
| days / frequency | Mon, Wed · or 3 per week |
| typical amount and range | ₹200 · ₹150 to ₹250 |
| origin | `stated` (user said it) · `learned` (from history) |

How it gets filled:

- **Stated:** the user writes or says a paragraph in the Brain ("office twice a week, football
  thrice, groceries most days"). The Brain parses it into items and shows an editable card.
- **Learned:** after about two weeks of data, the Brain drafts the routine from history and asks
  "Here's what I think your week looks like. Anything off?" Confirming a draft is easier than
  writing one, and it shows the AI actually knows them.
- **Not in onboarding** (`app/setup.tsx`). Every extra setup question costs signups.
- **Real data wins.** People describe the week they think they have. After about a month, learned
  values outweigh stated ones.

Three kinds of spending, so the Brain never asks about the wrong thing:

- **Fixed** (rent, subscriptions): already auto-logged by recurring expenses
  (`src/api/recurringExpenses.ts`). Never asked about.
- **Routine** (commute, football, groceries): shown as chips on the Today card.
- **One-off** (sneakers): captured by text, voice or screenshot.

Bonus: suggest envelopes from the routine. "Football 3x a week is about ₹2,400 a month. Want a
Sports envelope for that?"

### 2. Today card

A Home card (`app/(tabs)/index.tsx`, same `Card` as the rollover banner) built from the routine
and today's weekday.

```
Tuesday
[✓ Office ~₹200]  [✓ Football ~₹200]  [Groceries ₹__]
[+ Something else]
```

- Tap a chip to log it at the typical amount. Tap the amount to change it.
- "+ Something else" opens capture (text, voice, screenshot).
- **No AI call.** It's the routine applied to today's date, so it's free and instant.
- **Catch-up:** after a few skipped days, one card covers all of them with chips per day.
- Done state uses the shared `CheckIcon` success pattern.

### 3. Capture in the Brain (text and voice)

The user types or says: "auto 240, skipped lunch, sneakers 5k, turf 1200 split 6".

- **Server:** the Jev router gets a new `isCapture` route. Capture skips the FACTS and decision
  path (see the "AI Brain for Real Usecases" task) and makes a cheap structured-output call
  (flash-lite with a JSON schema) that returns proposed expenses:
  `item, amount, category, date, payee?, divisor?, confidence`.
- **Prompt context:** the user's envelope names, routine items, recent payee-to-category history,
  and today's date so "yesterday" resolves.
- **Parsing must handle:** Indian amounts (5k, 1.2L, "dedh sau" = 150, "dhai sau" = 250), splits
  ("split 6" → ₹200 via `src/lib/split.ts`), relative dates, and "skipped X" (log nothing).
- **Voice:** mobile records with `expo-audio` and uploads, and the server sends the audio to the
  model with the same schema. Web uses `MediaRecorder`. **This is a store build, not OTA:**
  `RECORD_AUDIO` is in `blockedPermissions` and the `expo-audio` plugin has
  `recordAudioAndroid: false` in `app.json`, so both need changing.
- **Entry points:** the Brain composer, plus a "Quick log" action that opens capture without a
  chat thread (from the log button now, and later the widget and share sheet).

### 4. Screenshot capture

The user uploads one to three screenshots of their GPay, PhonePe, Paytm or bank app history.

- **Server:** a vision call (extend `/api/expenses/scan` or add a capture endpoint) returns rows:
  `payee, amount, date/time, direction (paid | received), status (success | failed | pending)`.
- **Filter:** drop failed and pending rows. Offer received money as income (`app/modals/add-income.tsx`).
- **Dedupe, the big risk:** today's screenshot also shows yesterday's payments. Match each row
  against expenses already logged (amount, date, payee similarity) and against other screenshots
  in the same upload. Show matches collapsed as "Already logged". Borderline pairs fall through
  to the existing duplicates review (`app/modals/duplicates.tsx`).
- **Categorize** in this order: payee rules, then the user's history for that payee, then the
  routine, then `categoryMap` keywords, then `suggestCategoryLLM`.
- **Privacy:** don't store the image. Bill scans are saved via `/api/bills`; payment history is
  more sensitive. Read it, then discard it.
- **Upload paths:** in-app picker (`expo-image-picker`, already installed, so OTA-able). Web gets
  paste and drag-and-drop. An Android share target (share straight from GPay) is a store build
  and comes later.

### 5. Review card (shared by every input)

Every capture path ends on the same card. Build it from the bill-scan review patterns
(`src/features/scan-bill/ScanReview.tsx`, `useBulkSelection.ts`).

- Rows: amount, item or payee, envelope chip, date. Tap to edit, swipe to delete, "Split".
- Low-confidence rows are highlighted.
- Submit uses the shared `CheckIcon` success (per CLAUDE.md).
- **Learning:** after the user files the same payee the same way twice, ask "Always file Raju under
  Food?" A yes creates a payee rule, and future matches get filed confidently.

### 6. Propose, then commit

- `/api/ai/chat` streams a new SSE frame: `data: {"proposal": {...}}`.
- `streamChat` (`src/api/ai.ts`) only reads `delta`, `sessionId` and `error` today, so installed
  apps ignore the new frame and nothing breaks. The server should still only send proposals to app
  versions that render them, and send plain text to older ones.
- Submit calls the existing `POST /api/expenses` via `mintExpensePayload`, so the offline queue
  (`src/lib/pendingExpenses.ts`), `client_id` idempotency, conflict handling and duplicate
  detection all apply unchanged. Web and mobile behave the same.
- Tools, phased:
  - `propose_expenses` (phase 1)
  - `propose_income`
  - `propose_recategorize` ("move all Swiggy to Food")
  - `propose_move_money`
  - `update_routine`
- Anything destructive (delete, move money, bulk changes) always shows a card. Start add-only.

### 7. Weekly balance check and logged meter

- Once a week, a Home card or Brain prompt asks: "What's in your bank right now?"
- `gap = last balance + income logged − expenses logged − current balance`
- If the gap is meaningful: "₹3,400 wasn't logged this week. Food, travel, or something else?"
  The proposed split follows the routine and history, the user adjusts it, and it lands on the
  same review card. Those expenses get `source: balance_gap`.
- **Logged meter** on the weekly dashboard: `logged / (logged + gap)` → "92% of this week logged".
  It makes gaps visible instead of quietly wrong.
- **Known limitations:**
  - Credit cards don't reduce the bank balance until the bill is paid, so card users also enter
    their unbilled amount.
  - Money lent to a friend or moved to savings isn't spending, so offer "Not spending".
  - Multiple accounts means one number per account, or a total.

## Data model (Web repo, `Sukrittt/aviary`)

- `expenses`: add `source` (`manual | text | voice | screenshot | today_chip | balance_gap |
  recurring`) and nullable `payee`.
- `routine_items`: `user_id, label, category, kind, days_of_week, per_week, typical_amount,
  amount_min, amount_max, origin, updated_at`.
- `payee_rules`: `user_id, payee_key (normalized), category, created_at`.
- `balance_checks`: `user_id, date, balance, card_unbilled`.

## AI allowance

- Capture must never be blocked by the Brain chat allowance (`Web/lib/ai/allowance.ts`). Exempt
  capture routes, or give them their own larger quota. Text parsing on flash-lite is cheap.
  Screenshots and voice cost more.
- When an AI call fails or a quota is hit, fall back to the manual log sheet, prefilled with
  whatever we have. Copy example: "Couldn't read that one. Add it by hand?" Never show raw error
  text (CLAUDE.md voice rules).

## Phases

| Phase | Scope | Ships as |
|---|---|---|
| 1 | Text capture in the Brain. Jev `isCapture` route, structured extraction, `proposal` frame, review card, submit through existing APIs. `source` field. | Server deploy + OTA |
| 2 | Screenshot capture with dedupe, in-app picker, web paste. | Server deploy + OTA |
| 3 | Routine profile (stated and learned), Today card, catch-up, payee rules. | Server deploy + OTA |
| 4 | Voice, weekly balance check, logged meter, envelope suggestions from routine. | **Store build** (voice unblocks `RECORD_AUDIO`) |
| Later | Android share target, widget "to log" line and quick-log button. | Store build |

Double-check each phase against `docs/releasing.md` before publishing an OTA update.

## Testing

- Mobile: co-located Jest tests per CLAUDE.md. Proposal frame parsing in `streamChat`, review card
  edit, delete, split and submit, dedupe matching, Today card chip logic.
- Web: Vitest for the extraction schema, dedupe, gap math and routine learning. Add capture
  scenarios to `Web/lib/ai/brainEval.test.ts`: Hinglish amounts, splits, relative dates,
  "skipped", ambiguous payees, overlapping screenshots.

## Metrics (PostHog)

- Captures by source, items per capture, **edit rate per row** (parse accuracy), time from open to
  submit, weekly active loggers, share of weeks with a balance check, median logged %, and
  retention of weekly visitors.
- Targets: median capture-to-submit under 30s, row edit rate under 15%, logged % over 85% for users
  who do balance checks.

## Open questions

- **Daily reminder:** currently no push at all. The Today card on Home is the only daily prompt.
  Revisit after phase 3 with data on how often people open the app.
- **Screenshot formats:** GPay, PhonePe, Paytm, CRED and bank apps all differ. Collect samples
  before phase 2.
- **Balance check with several accounts and cards:** one total, or per account?
- **Stated vs learned routine:** how fast learned values take over, and what to show when they
  disagree.
- **Web parity:** the web app needs the same review card and Today card.

## Copy rules

Every user-facing string follows CLAUDE.md: second person, sentence case, short, contractions,
no em dashes, `·` as separator, `…` for ellipsis, no raw error text.
