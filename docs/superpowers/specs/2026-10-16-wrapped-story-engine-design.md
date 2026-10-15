# Wrapped phase 1: the story engine

Status: approved, built · 2026-10-16

## Why

Expense Wrapped shows the same 12 slides in the same order every month; only the
numbers change. It's nice once and repetitive after that. The goal is a Wrapped
people open at the start of every month because the *stories* change, not just
the figures, so the habit of opening the app on the 1st sticks.

Content matters most, then icons/mascot, then colour.

This is phase 1 of 4:

1. **Story engine** (this spec): a pool of story types, scored per month, top 6-8 shown.
2. Look and mascot: icons instead of emojis, the bird as host, palette rework.
3. Play: guess-then-reveal beats ("guess your total", "tap your spendiest day").
4. Editions and collection: per-month palette and mascot prop, badges that persist across months.

## Problems this fixes

The current copy claims things the data doesn't support:

- Total card says "every single day, without missing one" on a month with 7 of 28 days logged.
- Streak card says "Then a 19-day gap" when the gap came before the streak.
- Week race headline says days 22-end won while the caption asks "what happened around day 8?". Labels `15-21` and `22-end` wrap mid-word.
- Breakdown says "Hundreds of tiny yeses" on 19 transactions.
- Badges are the same four every month.
- Adjacent slides repeat colours (two greens, two magentas); the week race uses yellow.

Every story below has an eligibility rule, so a line only appears when the data backs it.

## Deck shape

- Fixed bookends: **Cover**, **The total** (with a "vs last month" line when `previous` exists), **Persona**, **Wrap/share**.
- Between them: the top 7 eligible pool stories, at most 2 per group, in group order:
  habit → money shape → things → envelopes → vs last month.
- Fewer than 4 eligible: show what's eligible. No padding.
- The badges slide is removed (returns as a real collection in phase 4).

## Story pool

Thresholds are starting values, tuned against real decks before launch (see Verification).
"Self-logged" means `source` is not `recurring`, `subscription` or `balance_gap`.
Habit stories use self-logged expenses only; money stories use all real spend (as today).

| # | Group | Type | Eligible when | Score grows with | Example line |
|---|---|---|---|---|---|
| 1 | habit | `showed_up` | always | share of days logged (high from 60%) | "You logged 22 of 30 days. That's most of a month." |
| 2 | habit | `streak` | longest self-logged streak ≥ 3 days | streak length | "9 days straight, 4 Sep to 12 Sep." |
| 3 | habit | `comeback` | a self-logged gap ≥ 5 days followed by a return | gap length | "You went quiet for 8 days. Then you came back." |
| 4 | habit | `night_logger` | ≥ 40% of self-logged entries timestamped 22:00-02:00 user time | that share | "You log after 10pm. A lot." (says *log*, not *spend*) |
| 5 | habit | `how_you_log` | scans or voice ≥ 30% of self-logged entries | that share | "11 bills scanned. You've stopped typing." |
| 6 | money | `biggest_hit` | largest expense ≥ 3× median expense | that ratio | "₹5,000 on Rent. 3 Sep, a Thursday." |
| 7 | money | `small_stuff` | ≥ 60% of expenses at or under a quarter of the month's mean expense | that share | "41 tiny purchases. They added up to ₹4,120." |
| 8 | money | `spendiest_weekday` | top weekday ≥ 1.5× mean weekday total | that ratio | "Thursday. ₹11,659." |
| 9 | money | `heavy_week` | one week ≥ 40% of the month | that share | "1 Sep to 7 Sep did most of the damage." |
| 10 | money | `weekend_split` | weekend-day spend ≥ 1.5× weekday-day spend (or the reverse) | that ratio | "Weekends cost you 2× a weekday." |
| 11 | things | `your_usual` | one item (normalised name) repeats ≥ 4 times | count | "Chai. 14 times. ₹840." |
| 12 | things | `top_category` | top category ≥ 35% of spend | that share | "Rent took 81%." |
| 13 | things | `where_it_went` | ≥ 3 categories | category count | breakdown bar, honest remainder line |
| 14 | envelopes | `stayed_put` | user budgets and money is left across envelopes | leftover / assigned | "₹44,917 never left its envelope." |
| 15 | envelopes | `burst_envelope` | an envelope ≥ 120% of its budget | overshoot | "Eating out hit 140% of its budget." |
| 16 | vs last | `up_or_down` | `previous` exists and total moved ≥ 10% | size of move | "₹3,200 less than August." |
| 17 | vs last | `category_mover` | a category moved ≥ 50% and by ≥ 10% of this month's total | size of move | "Travel tripled." |
| 18 | vs last | `new_category` | a category with spend now and none in `previous` | its spend | "First time spending on Pets. Welcome, whoever it is." |
| 19 | vs last | `habit_change` | days logged or longest streak improved | size of improvement | "Longest streak went from 3 to 9." |

Cut on purpose:

- **Payment mix.** `payment_method` defaults to `'bank'` unless an account is linked, so it would mostly read "Bank did 100%".
- **No-spend days.** The data can't tell a day without spending from a day without logging.

Scores are normalised to 0..1 per story so they compare across types.

Amounts are in each user's own currency, so thresholds are relative (to the month's mean
expense or total), never fixed rupee lines.

Found while checking against real data, now rules:

- Money and things stories need at least 5 entries; below that one row makes every share 100%.
- A month with no entries has no stories (it produced "down from last month" before).
- `showed_up` sits out when one streak covers most of the logged days ("31-day streak"
  beside "31 of 31 days" says the same thing twice).
- `top_category` needs at least two categories.

## Selection

`pickStories(current, previous, budgets) → Story[]`, a pure function:

1. Run every rule; keep eligible stories with their score and facts.
2. Novelty: multiply by 0.6 the score of any type in last month's deck. Last month's deck is
   `pickStories(previous, null, previousBudgets)` without the novelty step, so it never recurses
   past one month. An approximation, accepted.
3. Sort by score, take greedily with at most 2 per group, stop at 7.
4. Re-sort the chosen set into group order.
5. `variant = hash(userId + month + type)`, an unbounded number; each client takes it modulo
   its own copy list, so the same story reads differently next month and web and mobile agree
   without the server knowing how many lines each story has.

Deterministic: same inputs, same deck.

## Data contract

`GET /api/wrapped` keeps every existing field and adds:

```ts
stories: Story[]
previous: {
  month: string
  totalSpent: number
  daysLogged: number
  longestStreak: number
  topCategories: { category: string; total: number }[]
} | null

type Story =
  | { type: 'streak'; score: number; variant: number; facts: { days: number; startDate: string; endDate: string } }
  | { type: 'your_usual'; score: number; variant: number; facts: { item: string; count: number; total: number } }
  // ...one member per type in the table above
```

Clients skip any `type` they don't know, so the server can ship a new story ahead of the apps.

## Server changes (aviary)

- `src/services/wrappedAdapter.ts`: `computeWrapped` adds the facts the rules need: days in
  month, self-logged days, hour-of-day histogram in the user's timezone, counts by `source`,
  top repeated item, small-expense share, weekend vs weekday totals.
- `src/services/wrappedStories.ts` (new): the rules, scoring, `pickStories`, variant hash.
- `lib/wrapped.ts` `readRecap`: also loads the previous month's facts (via its own cached
  `readRecap`) and the month's budgets, then attaches `stories` and `previous`.
- Cache: the recap now depends on budgets, so budget writes invalidate `wrapped` for that
  month. Bump the cache key version so recaps cached without `stories` aren't served.
- Web `WrappedExperience.tsx` adopting `stories` is a follow-up; it keeps working on the
  existing fields meanwhile.

## Mobile changes (aviary-mobile)

- `src/api/wrapped.ts`: add `Story` and `previous` types.
- `src/components/wrapped/StoryCards.tsx`: one component per story type with its copy variants,
  and a `type → component` map. Unknown types are skipped. Background shapes rotate by
  `variant` too, tinted from the text color so they sit on any slide color.
- `WrappedScreen.tsx` `buildSlides`: bookends plus `data.stories` mapped through that map,
  replacing the fixed list. Missing `stories` (old server) renders bookends only.
- Slide colours are assigned by deck position from one palette so adjacent slides never match.
  Yellow is dropped now; the full palette rework is phase 2.
- Persona: call `/api/wrapped/judgement` (already built and cached server-side), fall back to
  today's rule ladder when it returns no persona or fails. Never blocks the deck.
- Copy follows `CLAUDE.md`: second person, contractions, no em dashes, `·` separator, no raw error text.
- Analytics: `wrapped_card_viewed` gains `story_type` alongside `index`.

## Verification

- **Server (Vitest):** each rule just below and just above its threshold; `pickStories` novelty,
  group cap, ordering, thin month, determinism; `computeWrapped` excludes automated sources
  from habit facts and buckets timestamps by user timezone.
- **Mobile (Jest):** render test per story component from a facts fixture; unknown type skipped;
  missing `stories` renders bookends; existing em dash lint covers new copy.
- **Real-data check:** a script runs `pickStories` over the demo account's last 3 months and
  prints each deck. Thresholds are tuned from that output before launch; the bar is that
  consecutive months produce visibly different decks.

## Release

Backend first (additive fields), then mobile. No native change, so mobile ships as an OTA
update per `docs/releasing.md`.

## Out of scope

Phase 2-4 items above, and the "undefined is not a function" crash on the Biggest hit slide,
which is fixed separately.
