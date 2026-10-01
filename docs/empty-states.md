# Empty states: the Aviary bird mascot

Every empty state uses the Aviary bird (`src/components/splash/birdPath.ts`) as a
mascot. The bird stays recognisably Aviary while its expression, framing, pose,
accent and prop change with the data family.

![Mascot concepts, light and dark](images/empty-state-mascots.png)

## Rules

- Bird, legs and perch use `tokens.text`. Props (lens, `?`, `z`, envelope) use `tokens.accent`.
- The eye is a cut-out. When it isn't a hole in the path, draw it in the surface
  color (`tokens.cardSolid` on cards) so it still reads as one.
- Built from the 512-unit bird artboard, rendered with `viewBox="40 40 460 460"`
  so the props have room.
- Decorative only: hidden from screen readers. The copy next to it carries the meaning.
- `EmptyState.tsx` composes subject-specific scenes for expenses, subscriptions,
  holdings, recurring items, scans, chat, archive, envelopes and insights. The
  scene settles first; the copy follows 60ms later. Reduced motion keeps a fade
  and a still mascot.
- Use an action when there's a useful next step. Empty filtered lists clear
  both the filters and search; new lists open their existing entry screen.
- Copy follows `CLAUDE.md` voice rules: short, second person, contractions, no em dashes.

## The family

| Mood | Looks like | Use for | Status |
| --- | --- | --- | --- |
| **A · Searching** | Magnifier over the eye | Search or filter with no results | Shipped in `EmptyState.tsx` |
| **B · Clear** | Awake bird with the subject-specific scene | A calm, intentional empty state | Shipped in `EmptyState.tsx` |
| **C · Snoozing** | Eye shut in a sleepy arc, head slowly nodding, two `z`s drifting up (static under reduced motion) | "Nothing yet": a new month or repeating data | Shipped: `src/components/shared/SnoozingBird.tsx` |

## Where it's used

| Screen | Empty case | Mood | Copy |
| --- | --- | --- | --- |
| Insights · "Where it went" (`CategoryBreakdown.tsx`) | No spending in the month | B · Clear | "Nothing spent yet" / "Log an expense and it'll land here." |
| Activity | Search or filters return no transactions | A · Searching | "Nothing turned up" / "No transactions for this filter." |
| Activity | No transactions without filters | C · Snoozing | "Your story starts here" |
| Subscriptions | No tracked subscriptions | C · Snoozing with repeat tile | "Keep tabs on your repeats" |
| Investments | No holdings | B · Clear with growth tile | "Room to grow" |
| Envelopes | No groups or categories | B · Clear with envelope scene | "Your envelopes are waiting" |
| Recurring | No recurring expenses | C · Snoozing with repeat orbit | "Set it once, forget it" |
| Bill scans | No scans | A · Searching with scan frame | "No scans yet" |
| Chat history | No chats or no search matches | B · Clear / A · Searching | "No past chats yet" / "Nothing turned up" |
| Archive | No archived items or no filter matches | B · Clear / A · Searching | "All clear in here" / "Nothing turned up" |
| Trend charts | No points | A · Searching with chart tile | Chart-specific empty note |

Use the shared component for new data-empty states so centering, accessibility,
motion and the illustration family remain consistent.
