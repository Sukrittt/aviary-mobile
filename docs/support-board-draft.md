# Aviary support board — publishing draft

Prepared 5 October 2026 for https://aviary.userjot.com/.

Publication is pending UserJot administrator sign-in. Feature requests below are suggestions for community voting, without delivery commitments. Keep them Pending until triaged. The two open issues are grounded in the mobile repository's existing issue tracker.

## Features · Pending

### Shared budgeting for couples and households

Invite a partner or family member to a shared budget. Each person should use their own Aviary account while seeing the same envelopes, available balances, and household transactions. Show who added each expense and let the budget owner manage access.

Which matters most to you: a fully shared household budget, selected shared envelopes, or separate personal and shared budgets? Vote and tell us how you would use it.

### Import transactions from a CSV or bank statement

Bring existing transaction history into Aviary without entering every expense manually. Map date, description, amount, and category columns; preview the import; and flag potential duplicates before saving.

Which bank or app would you import from? Share the format you need, without posting account details or financial statements publicly.

### Savings goals with a target amount and date

Set a target for an envelope, such as an emergency fund, holiday, or annual bill. Show progress toward the target and the monthly amount needed to reach it by the chosen date, while accounting for money already saved.

Would you use a target date, a monthly contribution target, or both?

### Track shared expenses and settlements

Track who paid a shared expense, how much each person owes, and when they settle up. Support equal and custom shares, and count only your own share toward your personal spending.

This extends splitting a receipt into an ongoing record of balances between people. Would you mainly use it for roommates, trips, or a partner?

## Bugs · Pending

### Keep pending Google Play payments visible

When Google Play reports a pending payment, or Aviary is still verifying a purchase, the explanation currently appears in a one-time alert. After dismissing it or reopening the app, it can be unclear whether the payment is still processing.

Show a persistent payment status on the Plan screen, with Check status and Restore purchases actions. Update the status once payment is confirmed and prevent another checkout while the known payment is unresolved.

Internal tracking: https://github.com/Sukrittt/aviary-mobile/issues/24

### Open email links in the correct Android app screen

Links in welcome, payment, and reminder emails should open the relevant Aviary screen. If sign-in or onboarding is needed, continue to that screen afterward. When the app is not installed, the same link should open a useful web page.

Internal tracking: https://github.com/Sukrittt/aviary-mobile/issues/23

## Updates · Changelog draft

### Faster expense entry and a place for your ideas

Recent Android improvements make everyday budgeting a little easier:

- **Calculate as you log.** Add, subtract, multiply, or divide directly in the expense amount keypad, with a live total.
- **Pick up where you left off.** An unfinished expense stays available when you switch tabs during the current app session. The draft clears after a successful save and stays scoped to your account.
- **Find the community board.** Open the feedback board from More to suggest a feature, report an issue, and vote on ideas.
- **Jump to the web app.** Open Aviary's web dashboard from More.
- **See recent investment activity first.** Investment events now appear newest first.
- **Retry an expense reliably.** A failed retry keeps the expense draft available until the expense is successfully logged.

Have an idea for Aviary? Add it to the board or vote on an existing request. Shared budgeting is one of the first ideas up for discussion.

### Publishing notes

The changelog describes changes merged into mobile `main` through `2d0b20c` on 5 October 2026. Confirm their availability in the distributed Android build before publishing this as a released update; no release version or rollout date has been assumed.

Changelog evidence: `cf7ff52`, `a0bdaa3`, `97b1e0a`, `67cf7e8`, `0b017af`, and `f1e73fd`.

The public board currently displays Features and Bugs boards plus an Updates tab. Upvote/downvote behavior and administrator publishing controls must be checked after sign-in; do not promise downvotes until the platform confirms support.
