# Effortless logging

Plan · drafted 2026-09-26 · updated 2026-09-27 · status: phases 1 and 2 built, in review

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

- **Jev routes it.** The chat router gets an `isCapture` question in the Jev call it already makes
  for every message, so detecting a log costs no extra call. Capture is checked before the
  off-topic refusal (a log isn't "asking about money") and skips the FACTS and decision path (see
  the "AI Brain for Real Usecases" task).
- **Gemini reads it.** A cheap structured-output call pulls out item, amount, date and split
  count. It handles Indian amounts (5k, 1.2L, "dedh sau" = 150, "dhai sau" = 250), splits,
  relative dates and "skipped X" (log nothing). It doesn't pick envelopes.
- **Jev picks the envelope for each row.** First the user's own history (the category map), then
  Jev's existing `pickCategory` from the user's envelope list. Jev's probability is what marks a
  row as uncertain on the review card, instead of the model grading itself.
- **`unusualAmount` flags odd amounts** on the card (over 5x the envelope's usual), which catches
  voice or typing slips like "fifteen" vs "fifty". No AI needed.

### Where Jev fits

Gemini reads and writes. Jev chooses between options we already know. Plain code handles anything
arithmetic or rules can do.

| Feature | Jev? | Why |
|---|---|---|
| Is this message a log? | Yes | One more question in the router call that already runs |
| Envelope for each row | Yes | `pickCategory`, after the user's own history |
| Pulling items and amounts out of text | No | Jev can't extract, Gemini does |
| Weekly balance check split | No | Arithmetic on history |
| Today card | No | The point is no AI call |
| Learned routine | Yes | Sort patterns into fixed, routine or one-off, like recurring suggestions |
| Payee rules | No | Fixed rules |
| Screenshot rows | Yes | Envelope per row, and borderline duplicates after a same-amount, same-date filter |
| Moving money (later tool) | Partly | Gemini pulls out the amount, Jev picks the envelopes |

### 3. Weekly balance check and logged meter (phase 2)

**Rule: one number, and a second question only when the numbers say something's off.** No setup,
no list of accounts, no card statements.

**Every account they pay from, totalled.** The user types the balance of each account they pay
from with UPI (a bank plus, say, a Slice account), names each once, and is asked about the same
list every week. The check runs on the total: money moved between those accounts cancels out, and
a UPI spend from any of them is covered. Up to 5 accounts. Adding or removing one makes that
check a new starting point, or the new account's money would read as income. Savings and FD
accounts nobody spends from can stay out; money moved in from them shows up once as "money in".

**The math.** Each check stores the balance and its time. Between two checks:

- `logged` = expenses paid from the bank (not card, not cash) with a timestamp after the last
  check, leaving out earlier gap estimates (`source: balance_gap`).
- `gap = (last balance − this balance) − logged`
- The app shows the balance it expects (`last balance − logged`) as a hint, never a prefill:
  it can't know how the total splits across accounts, and typing each real number keeps the
  check honest.
- **Tolerance:** a gap smaller than one typical purchase (the user's median expense, capped at 1%
  of the last balance) is "All square". Nothing to answer.
- **Cumulative:** skipping a week costs nothing. The next check covers everything since the last.
- The first check only sets the starting point.

**When there's a gap.** "₹3,400 left your account that you haven't logged. What was it?"

- **Spends I didn't log:** split across the user's usual envelopes (their top three by recent bank
  spending) and shown on the same review card as phase 1. They log with `source: balance_gap`,
  so insights can tell estimates apart.
- **Card bill:** that part isn't spending. It's compared with the card spends logged in the last
  30 days. If the bill is clearly bigger (by more than the tolerance and 15%), the difference is
  offered as estimated card spends, split by the user's usual card envelopes. Card users answer
  this once a month, when they've just paid and know the number.
- **Moved, lent or cash:** not spending. Cash spends are logged by hand or by typing them in.
- **A mix:** enter the card bill and the moved amount, the rest counts as spends not logged.

**When there's more money than expected:** income or salary, a refund or someone paying back, or
money moved in. One tap, nothing is logged.

**Logged meter.** Each check records how much of the bank's outflow the user had logged themselves:
`logged / (logged + spends not logged)`. Home shows "92% logged at your last check".

**Where it lives.** A Home card when a check is due (7+ days since the last one), with Later to
hide it for a day. A modal for the check itself. No AI call anywhere in phase 2.

**Known limits.**

- Cash spending isn't caught.
- Heavy card users mostly show up once a month, when the bill is paid.
- The split is a best guess from habits. A one-off gets spread until the user fixes it.
- An expense paid before a check but logged after it lands in the next period.

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

1. **Jev `isCapture` question** in the router's existing call. Checked before the off-topic
   refusal. A message that is both a log and a decision question ("bought sneakers for 5k, was
   that too much?") goes down the normal chat path. Start the cutoff at 0.5 and tune it on the
   eval set, like `isDecision`.
2. **Extraction call.** Flash-lite with a JSON response schema:
   `{ items: [{ item, amount_inr, date, divisor }], skipped: [], unparsed: [] }`. No envelope.
3. **Server-side validation.** Amount above zero and at most ₹1 crore, split count 1 to 50, date
   not in the future (clamped to today) and within the last 31 days (older items go to `unparsed`),
   at most 20 items.
4. **Envelope per row.** The user's category map first, then Jev `pickCategory` in parallel. Each
   row carries `category` (empty when unsure) and `categoryConfidence`.
5. **`proposal` SSE frame**, then a short text line, then `[DONE]`. Only for clients that send
   `X-Aviary-Capture: 1`. Older clients and the web app get a plain line pointing to the + button,
   with no extraction call. The demo account gets "sign in to log".
6. **Proposal state in the chat session.** Stored on the model message, encrypted like the message
   text (`messages.proposal` joins `ENCRYPTED_FIELDS`), with a plaintext `proposalStatus`
   (`pending | submitted | dismissed`). `PATCH /api/ai/chat/sessions/:id/proposals/:proposalId`
   moves it out of `pending` once, and the session GET returns it so history renders read-only.
7. **`source` on expenses.** `POST /api/expenses` accepts an optional whitelisted `source`
   (`manual | text`), default `manual`. `createExpense` already stores it.
8. **Allowance.** Capture calls are logged as feature `capture` and excluded from the monthly
   dollar allowance. They're still bounded by the chat rate limits. When a user is over the
   allowance, capture-capable clients are routed first: a log goes through, anything else still
   gets the allowance 429.
9. **Eval.** Capture scenarios in `lib/ai/brainEval.test.ts`: Hinglish amounts, splits, "skipped",
   relative dates, several items in one sentence, and non-capture messages that must not trigger
   it.

### Mobile (this repo)

1. **`streamChat`:** send the capture-capable header, parse `proposal` frames, add an `onProposal`
   callback. `ChatMessage` gets an optional `proposal`.
2. **`CaptureReview` card** in `src/components/brain/`: rows, inline edit, envelope picker, delete,
   split display, low-confidence highlight, "Log 3 spends" with `CheckIcon`, and Dismiss.
3. **Submit:** each row goes through the existing add-expense path, so it queues offline.
   `client_id` is `capture:<proposalId>:<rowId>`, so a double tap, retry or reopened chat can
   never create a second row. `NewExpenseRow` gets an optional `source`. After submit, mark the
   proposal submitted (best effort). On partial failure, show which rows failed and keep them
   editable.
4. **Flag odd amounts** with `unusualAmount` on each row.
5. **History:** submitted proposals render as a read-only summary ("Logged 3 · ₹5,590").
6. **Entry point:** a "Log several at once" link on the log-expense screen opens the Brain in a
   focused capture mode: a hint instead of the brief, and no allowance screen, since logging never
   counts against the allowance.
7. **Fallback:** when AI fails or a cap is hit, show "Couldn't read that one. Add it by hand?" and
   open the manual log sheet. Never show raw error text.
8. **Analytics (PostHog):** proposal shown (item count), submitted (items, rows edited, rows
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

## Phase 2 spec

**Goal:** once a week the user types one balance, and the app catches what they didn't log. As
built; the design is in section 3 above.

### Server (`Sukrittt/aviary`)

1. **`balance_checks` collection**, scoped by `user_id` like every other collection. Each check
   stores `timestamp`, `date`, `status` (`baseline | square | open | resolved`), `kind`
   (`baseline | square | unlogged | surplus`) and the amounts: `balance`, `expected`, `logged`,
   `gap`, `tolerance`, and once resolved `forgotten`, `card_bill`, `card_shortfall`, `moved_out`
   or `money_in`. Amounts are stored as strings and encrypted (`ENCRYPTED_FIELDS`). Index
   `{ user_id: 1, timestamp: -1 }`.
2. **The math lives in `lib/balanceCheck.ts`**, all pure functions with tests: `spendBetween`
   (bank only, estimates left out), `toleranceFor`, `classify`, `splitByHabit`, `cardShortfall`,
   `loggedPct`, `isDue`, `anchorOf` and `gapProposal`.
3. **`GET /api/balance-checks`:** `{ due, open, expected, anchor, loggedPct }`. Due means no check
   yet, 7+ days since the anchor, or an open gap. The demo account is never due.
4. **`POST /api/balance-checks` `{ balance }`:** the first check is the baseline. Later ones come
   back `square`, `unlogged` or `surplus` with `expected`, `logged`, `gap`, `tolerance` and
   `cardSpendRecent`. A new balance replaces an open check, so a typo is fixed by checking again.
5. **`POST /api/balance-checks/:id/resolve`:** `{ cardBill?, movedOut? }` for a gap, or
   `{ moneyIn: income | refund | moved_in }` for a surplus. What's left of a gap after the card
   bill and moved money (if more than the tolerance) comes back as an estimate proposal in the
   capture shape: ids `g1…`, item "Unlogged spends" or "Unlogged card spends", the check's date,
   `paymentMethod`. Resolving again returns the same answer.
6. **`source: balance_gap`** joins the whitelist on `POST /api/expenses`.

### Mobile (this repo)

1. **API and hooks:** `src/api/balanceChecks.ts`, `src/hooks/useBalanceCheck.ts` (query key
   `['balance-check']`, invalidated by both mutations).
2. **Home card** (`src/components/balance/BalanceCheckCard.tsx`): a prompt when due, with first
   check, weekly and "finish your check" copy, Check now and Later. Later hides it for 24 hours
   (SecureStore, cleared on sign-out). Otherwise a slim meter, "92% logged at your last check",
   that opens a check early. Nothing before the first measured check.
3. **Modal** (`app/modals/balance-check.tsx`): each account's balance on a numpad, with
   "+ Add another account", and the expected total as a hint (fetched fresh on open). Baseline, square and a surplus reason end on the
   shared `CheckIcon` success and close. A gap asks what it was with one-tap answers; card bill,
   moved and a mix ask for amounts and show what's left live.
4. **Estimates reuse the capture card.** `CaptureReview` takes an `origin`: balance-check rows log
   with `source: balance_gap`, the row's `payment_method`, "Estimated from a balance check" in the
   notes, and `client_id` `gap:<checkId>:<rowId>`. The card reports its outcome through
   `onSettled` instead of calling the chat API itself, so it works outside the Brain.
5. **Analytics:** `balance_checked` (`kind`, `accounts` count) and
   `balance_resolved` (`reason`). No amounts.

### Known gaps in what's built

- **Closing during the review loses the estimates.** The check is resolved before the review card
  shows, so closing the modal without logging drops the rows. They're still returned by resolving
  again, but no screen asks for them. Fine for now (skipping costs nothing); revisit if dismissals
  are high.
- **Web has no UI yet.** The API is shared, but the web app needs its own card and modal.

## Data model (Web repo, `Sukrittt/aviary`)

- `expenses`: add `source` (`manual | text | voice | screenshot | today_chip | balance_gap |
  recurring`) and nullable `payee`.
- Chat messages: optional `proposal` (encrypted JSON), plus plaintext `proposalId` and
  `proposalStatus` (`pending | submitted | dismissed`) so status can change without decrypting.
- `balance_checks` (phase 2): see the phase 2 spec.
- Later phases: `routine_items`, `payee_rules`.

## Testing

- Mobile: co-located Jest tests per CLAUDE.md.
- Web: Vitest, plus capture scenarios in `Web/lib/ai/brainEval.test.ts`.

## Metrics (PostHog)

- Captures by source, items per capture, **edit rate per row** (parse accuracy), time from open to
  submit, weekly active loggers, share of weeks with a balance check, median logged %, gap
  reasons, accounts per check, and retention of weekly visitors.
- Targets: median capture-to-submit under 30s, row edit rate under 15%, logged % over 85% for users
  who do balance checks.

## Open questions

- **Pricing:** Aviary's price lives in Play, not this repo. Research says keep INR pricing well
  below global apps. A lifetime tier would help with subscription fatigue but has to exclude or
  cap AI, since AI costs recur.
- **Screenshot formats:** collect samples from every major UPI app before phase 4.
- **Balance check across accounts:** settled as the total of every account the user pays from
  (named once, up to 5), with card bills asked about only when they show up as a gap.
- **Stated vs learned routine:** how fast learned values take over.
- **Web parity:** the web app needs the review card, balance check and Today card.

## Copy rules

Every user-facing string follows CLAUDE.md: second person, sentence case, short, contractions,
no em dashes, `·` as separator, `…` for ellipsis, no raw error text.
