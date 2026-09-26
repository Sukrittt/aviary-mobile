# Effortless logging

Plan · drafted 2026-09-26 · updated 2026-09-26 with market research · status: planning

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

## Positioning

Envelope budgeting without the typing. Built for India, on Android and web, open source, and it
never reads your SMS. No competitor we found combines all of these (see Market research).

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
2. **Review before save.** AI mistakes look plausible (every field filled, amount wrong). Nothing
   the AI reads gets saved until the user has seen it.
3. **The AI proposes, the app commits.** The model never writes to the database. It returns a
   proposal, the app shows a review card, and Submit goes through the existing endpoints.
4. **Keep a moment of attention.** Tracking helps because people notice their spending. The
   confirm tap is a feature. Fully silent capture would lose it.
5. **Totals first.** A weekly balance check catches what recall misses, so totals are always right.
6. **Skipping costs nothing.** No guilt piles. A missed day or week is one quick catch-up.
7. **The AI allowance never blocks logging.** If logging stops working mid-month, the habit breaks.

## Market research (2026-09-26)

Sources were web search results. App store pages were blocked from the research environment, so
ratings and prices come from snippets and may vary by region.

**The problem is real.** Manual entry is the most cited reason people quit budgeting apps. YNAB
itself tells users to log as they go and reconcile weekly.

**Capture methods aren't new.** Voice, text and screenshot logging are common in 2026. Building them
is parity, not an edge.

| App | Market | Capture | Price | Traction |
|---|---|---|---|---|
| YNAB | Global, US-first | Manual, US bank sync | $14.99/mo or $109/yr | Est. ~$50M/yr revenue |
| Goodbudget | Global, envelopes | Manual, US-only sync on Premium | Free or $80/yr | Long-running |
| Money Vault | iOS only | Voice, receipts, AI chat, on-device | Free, Pro $6.99/mo or $39.99/yr | Unknown, mostly self-published content |
| MonAi | iOS, Android | Voice, text, Apple Pay | $5/mo or $50/yr | 250k+ iOS downloads, 4.8★ (8.5k) |
| Finny | iOS | Voice, text, batch screenshots | $9.99/mo or $49.99/yr | Unknown |
| ExpenseBit | India | WhatsApp text, Hindi/English voice, photos | Free | Small |
| FinArt | India | SMS, notifications, email | Trial, then paid | 1M+ downloads, 4.5★ |
| Axio (ex-Walnut) | India | SMS | Free with ads | Now a lender (BNPL, loans) |
| Money Manager | Global, big in India | Manual | Free, sync $19.99/yr | 50M+ installs |
| BillShot | India | One UPI screenshot per payment | Unknown | Early |

**What users want and don't get:**

- Envelopes without manual entry outside the US ("love envelopes, hate typing, that is the wall").
- Accurate data: Axio users report duplicates and missed transactions, and voice users say AI
  gets numbers wrong.
- Privacy without giving up automation: SMS apps turning into loan apps is a real fear.
- Fair pricing: price hikes are YNAB's top complaint, and subscription fatigue is rising.
- Sync across devices (Money Manager has none) and Android plus web (Money Vault is iOS-only).
- Splitting: Splitwise now caps free users at about 2 to 5 expenses a day, with ads.
- Shared household budgets. Aviary doesn't have this.

**Where Aviary is different:** a routine-based Today card and a weekly balance gap split into
categories. We found neither anywhere else. YNAB records the balance gap as one lump adjustment.

**What changed in this plan because of it:**

- Review before save became a principle.
- The weekly balance check moved from phase 4 to phase 2.
- An opt-in daily reminder is now planned (phase 3), since none at all was a retention risk.
- Voice moved to the last phase: it's the most crowded feature and needs a store build.
- Splits and household budgets were added to Later.

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

### 1. Review card and propose-then-commit (phase 1)

Every capture path ends on the same card. Build it from the bill-scan review patterns
(`src/features/scan-bill/ScanReview.tsx`, `useBulkSelection.ts`, `ExpandableItemNameInput.tsx`).

- Rows: amount, item, envelope chip, date. Edit inline, change envelope, delete a row.
- Splits show as "₹1,200 ÷ 6 = ₹200" (`src/lib/split.ts`).
- Low-confidence rows are highlighted.
- Submit uses the shared `CheckIcon` success (per CLAUDE.md).

Server side:

- `/api/ai/chat` streams a new SSE frame: `data: {"proposal": {...}}`.
- `streamChat` (`src/api/ai.ts`) only reads `delta`, `sessionId` and `error` today, so installed
  apps ignore the new frame. The server still only sends proposals to clients that say they can
  render them, and sends plain text to older ones.
- Submit calls the existing `POST /api/expenses` via `mintExpensePayload`, so the offline queue
  (`src/lib/pendingExpenses.ts`), `client_id` idempotency, conflict handling and duplicate
  detection all apply unchanged.
- Tools, phased: `propose_expenses` (phase 1), then `propose_income`, `propose_recategorize`
  ("move all Swiggy to Food"), `propose_move_money`, `update_routine`. Anything destructive always
  shows a card.

### 2. Text capture in the Brain (phase 1)

The user types: "auto 240, skipped lunch, sneakers 5k, turf 1200 split 6".

- The Jev router gets a new `isCapture` route. Capture skips the FACTS and decision path (see the
  "AI Brain for Real Usecases" task) and makes a cheap structured-output call.
- Parsing handles Indian amounts (5k, 1.2L, "dedh sau" = 150, "dhai sau" = 250), splits, relative
  dates and "skipped X" (log nothing).
- Prompt context: the user's envelope names, recent item-to-category history, today's date.

### 3. Weekly balance check and logged meter (phase 2)

- Once a week, a Home card asks: "What's in your bank right now?"
- `gap = last balance + income logged − expenses logged − current balance`
- If the gap is meaningful: "₹3,400 wasn't logged this week. Food, travel, or something else?"
  The proposed split follows history, the user adjusts it on the same review card, and those
  expenses get `source: balance_gap`.
- **Logged meter** on the weekly dashboard: `logged / (logged + gap)` → "92% of this week logged".
- **No AI call needed.** The split is arithmetic on the user's history.
- **Known limitations:**
  - Credit cards don't reduce the bank balance until the bill is paid, so card users also enter
    their unbilled amount.
  - Money lent to a friend or moved to savings isn't spending, so offer "Not spending".
  - Multiple accounts means one number per account, or a total.

### 4. Routine profile and Today card (phase 3)

A structured list of the user's usual spends:

| Field | Example |
|---|---|
| label | Office commute |
| category | Travel |
| kind | `fixed` · `routine` |
| days / frequency | Mon, Wed · or 3 per week |
| typical amount and range | ₹200 · ₹150 to ₹250 |
| origin | `stated` (user said it) · `learned` (from history) |

- **Stated:** the user writes a paragraph in the Brain, parsed into an editable card.
- **Learned:** after about two weeks, the Brain drafts it from history: "Here's what I think your
  week looks like. Anything off?"
- **Not in onboarding.** Real data outweighs stated values after about a month.
- **Fixed** spends (rent, subscriptions) come from recurring expenses and are never asked about.
- Bonus: suggest envelopes. "Football 3x a week is about ₹2,400 a month. Want a Sports envelope for
  that?"

The Today card on Home:

```
Tuesday
[✓ Office ~₹200]  [✓ Football ~₹200]  [Groceries ₹__]
[+ Something else]
```

- Tap a chip to log it at the typical amount. Tap the amount to change it. No AI call.
- A catch-up card covers skipped days.
- **Opt-in daily reminder** at a time the user picks, sent through the existing server push and
  notification preferences (`app/account/notifications.tsx`), so no native change.
- **Payee rules:** after two identical choices, "Always file Raju under Food?"

### 5. Screenshot capture (phase 4)

The user uploads one to five screenshots of GPay, PhonePe, Paytm or bank app history.

- A vision call returns rows: payee, amount, date/time, paid or received, success or failed.
- Drop failed and pending rows. Offer received money as income (`app/modals/add-income.tsx`).
- **Dedupe is the big risk:** match against logged expenses and the rest of the upload, and show
  "Already logged". Borderline pairs go to the existing duplicates review.
- Don't store the image. In-app picker (`expo-image-picker`, already installed). Web gets paste
  and drag-and-drop.

### 6. Voice (phase 5)

- Same schema as text. Mobile records with `expo-audio`, web uses `MediaRecorder`.
- **Store build:** `RECORD_AUDIO` is in `blockedPermissions` and the `expo-audio` plugin has
  `recordAudioAndroid: false` in `app.json`. Both need changing.

## Phases

| Phase | Scope | Ships as |
|---|---|---|
| 1 | Text capture in the Brain, review card, propose-then-commit, `source` field | Server deploy + OTA |
| 2 | Weekly balance check, logged meter | Server deploy + OTA |
| 3 | Routine profile, Today card, catch-up, payee rules, opt-in daily reminder | Server deploy + OTA |
| 4 | Screenshot capture with dedupe | Server deploy + OTA |
| 5 | Voice | **Store build** |
| Later | Split tracking (who owes), shared household budgets, Android share target, widget quick-log | Mixed |

Double-check each phase against `docs/releasing.md` before publishing an OTA update.

## Phase 1 spec

**Goal:** a user types several spends in the Brain, sees them on a review card, fixes anything
wrong, and logs them all with one tap. This proves propose-then-commit and gives us a parse
accuracy number before we build anything else on it.

### Server (`Sukrittt/aviary`)

1. **Jev `isCapture` route.** "Is the user reporting spends to log?" Tune the cutoff on the eval
   set, like `isDecision`. Questions and chatter must not route to capture.
2. **Extraction call.** Flash-lite with a JSON response schema:
   `{ items: [{ item, amount_inr, category, date, divisor, confidence }], skipped: [], unparsed: [] }`.
   `category` must be one of the user's envelope names or empty.
3. **Server-side validation.** Amount above zero and below a sanity cap, date not in the future and
   within the last 31 days, unknown categories blanked, malformed items dropped.
4. **`proposal` SSE frame**, then a short text line, then `[DONE]`. Only for clients that send a
   capture-capable header. Older clients get a plain-text list and a nudge to log by hand.
5. **Proposal state in the chat session.** Store each proposal with `status: pending`. Add an
   endpoint to mark it `submitted` (with expense ids) or `dismissed`. Reopening a session shows
   submitted proposals read-only, so nothing can be logged twice.
6. **`source` on expenses.** Optional, whitelisted, defaults to `manual`. Capture sends `text`.
7. **Allowance.** Capture calls don't count against the chat allowance. Give them their own
   generous cap.
8. **Eval.** Add about 20 capture scenarios to `Web/lib/ai/brainEval.test.ts`: Hinglish amounts,
   splits, "skipped", relative dates, unknown categories, several items in one sentence, and
   non-capture messages that must not trigger it.

### Mobile (this repo)

1. **`streamChat`:** send the capture-capable header, parse `proposal` frames, add an `onProposal`
   callback. `ChatMessage` gets an optional `proposal`.
2. **`CaptureReview` card** in `src/components/brain/`: rows, inline edit, envelope picker, delete,
   split display, low-confidence highlight, "Log 3 spends" with `CheckIcon`, and Dismiss.
3. **Submit:** each row goes through `mintExpensePayload` and the existing add-expense path, so it
   queues offline. `NewExpenseRow` gets an optional `source`. After submit, mark the proposal
   submitted (best effort). On partial failure, show which rows failed and keep them editable.
4. **History:** submitted proposals render as a read-only summary ("Logged 3 · ₹5,590").
5. **Entry point:** a "Log several at once" link on the log-expense screen that opens the Brain
   with a hint: "What did you spend? Try: auto 240, lunch 150".
6. **Fallback:** when AI fails or a cap is hit, show "Couldn't read that one. Add it by hand?" and
   open the manual log sheet. Never show raw error text.
7. **Analytics (PostHog):** proposal shown (item count), submitted (items, rows edited, rows
   deleted), dismissed, time from proposal to submit.

### Tests

- Mobile (Jest): `streamChat` proposal parsing and old-frame compatibility, `CaptureReview` edit,
  delete, split and submit, offline submit queues, history renders read-only.
- Web (Vitest): schema validation, capture routing, proposal state transitions, `source` handling.

### Done when

- Eval: at least 90% of items get the right amount and 80% the right envelope.
- Submitting works offline and never logs a proposal twice.
- Older app versions get the text fallback without errors.
- Capture doesn't use the chat allowance.

### Not in phase 1

Voice, screenshots, routine, Today card, payee rules, balance check, the other tools, share
target.

## Data model (Web repo, `Sukrittt/aviary`)

- `expenses`: add `source` (`manual | text | voice | screenshot | today_chip | balance_gap |
  recurring`) and nullable `payee`.
- Chat messages: optional `proposal` with `status` (`pending | submitted | dismissed`).
- Later phases: `balance_checks`, `routine_items`, `payee_rules`.

## Testing

- Mobile: co-located Jest tests per CLAUDE.md.
- Web: Vitest, plus capture scenarios in `Web/lib/ai/brainEval.test.ts`.

## Metrics (PostHog)

- Captures by source, items per capture, **edit rate per row** (parse accuracy), time from open to
  submit, weekly active loggers, share of weeks with a balance check, median logged %, and
  retention of weekly visitors.
- Targets: median capture-to-submit under 30s, row edit rate under 15%, logged % over 85% for users
  who do balance checks.

## Open questions

- **Pricing:** Aviary's price lives in Play, not this repo. Research says keep INR pricing well
  below global apps. A lifetime tier would help with subscription fatigue but has to exclude or
  cap AI, since AI costs recur.
- **Screenshot formats:** collect samples from every major UPI app before phase 4.
- **Balance check with several accounts and cards:** one total, or per account?
- **Stated vs learned routine:** how fast learned values take over.
- **Web parity:** the web app needs the review card, balance check and Today card.

## Copy rules

Every user-facing string follows CLAUDE.md: second person, sentence case, short, contractions,
no em dashes, `·` as separator, `…` for ellipsis, no raw error text.
