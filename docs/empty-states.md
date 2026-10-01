# Empty states: the Aviary bird mascot

Every empty state uses the Aviary bird (`src/components/splash/birdPath.ts`) as a
mascot. The bird never changes shape. Only its expression and one prop change, so
each empty state reads as the same character reacting to the situation.

![Mascot concepts, light and dark](images/empty-state-mascots.png)

## Rules

- Bird, legs and perch use `tokens.text`. Props (lens, `?`, `z`, envelope) use `tokens.accent`.
- The eye is a cut-out. When it isn't a hole in the path, draw it in the surface
  color (`tokens.cardSolid` on cards) so it still reads as one.
- Built from the 512-unit bird artboard, rendered with `viewBox="40 40 460 460"`
  so the props have room.
- Decorative only: hidden from screen readers. The copy next to it carries the meaning.
- `EmptyState.tsx` composes the bird with a soft orange halo, an orbit, and a
  tilted receipt, repeat, or growth tile. The scene settles first; the copy
  follows 60ms later. Reduced motion keeps a fade and a still mascot.
- Use an action when there's a useful next step. Empty filtered lists clear
  both the filters and search; new lists open their existing entry screen.
- Copy follows `CLAUDE.md` voice rules: short, second person, contractions, no em dashes.

## The family

| Mood | Looks like | Use for | Status |
| --- | --- | --- | --- |
| **A · Searching** | Magnifier over the eye | Search or filter with no results | Shipped in `EmptyState.tsx` |
| **B · Puzzled** | Head tilted toward the perch, `?` marks | Charts or data that should exist but don't | Concept |
| **C · Empty envelope** | Bird peeking into an open, empty envelope | No envelopes, empty lists | Concept (pose needs rework: should lean into the envelope) |
| **D · Snoozing** | Eye shut in a sleepy arc, head slowly nodding, two `z`s drifting up (static under reduced motion) | "Nothing yet": a new month, no spending | Shipped: `src/components/shared/SnoozingBird.tsx` |

## Where it's used

| Screen | Empty case | Mood | Copy |
| --- | --- | --- | --- |
| Insights · "Where it went" (`CategoryBreakdown.tsx`) | No spending in the month | D · Snoozing | "Nothing spent yet" / "Log an expense and it'll land here." |
| Activity | Search or filters return no transactions | A · Searching | "Nothing turned up" / "No transactions for this filter." |
| Activity | No transactions without filters | D · Snoozing | "Your story starts here" |
| Subscriptions | No tracked subscriptions | D · Snoozing with repeat tile | "Keep tabs on your repeats" |
| Investments | No holdings | D · Snoozing with growth tile | "Room to grow" |

## Next

- Audit every other empty state in the app and assign each one a mood.
- `EmptyState` now selects the searching or snoozing mood. Keep additional
  moods within this shared family.
