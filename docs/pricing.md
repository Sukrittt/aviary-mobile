# Pricing and subscription plan

Status: agreed planning baseline; not implemented.
Last updated: 2026-10-12 (prices synced to useaviary.com/legal/pricing).

## Goals

- Earn modest side income through an affordable subscription.
- Focus on budgeting enthusiasts.
- Keep the app ad-free, permanently: no ads, ever.
- Support ongoing development, hosting, and useful AI improvements.

## Launch pricing

All prices are in INR, taxes included, matching the live pricing page. Google Play may show a slightly different local price in the Android app.

| Plan | Monthly | Annual | Scope |
| --- | --- | --- | --- |
| Individual | ₹199 | ₹1,999 (save 16%, about ₹167/month) | Personal budgeting |
| Shared | TBD | TBD | Up to five people total, each with private budgeting plus one shared budget |

- One subscription pays for the shared group; invited members can log transactions in the shared budget.
- The direction is subscription access to the app after a trial, rather than a permanent free core with optional paid extras.
- A separate charge for keeping transaction history beyond 12 months is not part of this plan.

## Billing launch scope

- Launch paid **Individual first**; Shared follows later.
- Purchases happen in the Android app through **Google Play Billing**, integrated using **RevenueCat**.
- The web app recognizes the subscription through our backend when the user signs in with the same Envelope account. Web does not run Google Play checkout; users subscribe in Android.
- No separate web payment gateway or Razorpay setup at launch.
- The app is already on Google Play; merchant/payment profile setup is still required.
- Our backend owns the no-payment-details trial and access decisions; the paid store subscription begins only after an explicit purchase.
- Implementation sequence, service readiness checks, and proposed lifecycle design: [payment-subscriptions-plan.md](payment-subscriptions-plan.md).

## Trial and launch transition

- Standard trial: **45 days**.
- Trial starts when onboarding is completed, including initial budget/income setup—not at account signup.
- No payment details are required during the trial.
- Users explicitly subscribe to continue after the trial; the trial itself never causes an automatic charge.
- Existing users receive a fresh 45-day trial when subscriptions launch.
- No promise of permanently free existing features has been communicated to users, according to the planning discussion.
- The earlier six-month trial idea was replaced by this 45-day trial.

## Expiry, export, and retention

- After the trial or paid subscription expires, active app use requires a subscription.
- Export remains available without payment as an exit route.
- Retain data for **12 months after trial or subscription expiry**, provisionally.
- Export remains available during that retention period.
- Send reminders before deletion; exact timing and deletion mechanics still need design.
- The 12-month inactive-data policy is separate from transaction age. It is not a rolling limit on history for active subscribers.

## Future feature directions

Explore these as part of the paid offering; exact scope and delivery order are undecided:

- Richer/custom reports and longer-term comparisons.
- Advanced budgeting or transaction rules.
- Shared budgeting.
- More useful AI involvement and potentially a stronger model.

Some AI capabilities already exist. Review them before proposing duplicate features. The current model was described informally as a basic Gemini model; its exact identity and usage costs have not been verified.

Do not promise unlimited premium AI. Decide model selection, included usage, and any limits after measuring quality and costs.

## Messaging direction

Draft, to use once the paid offering is ready:

> Try the full app free for 45 days. No payment details needed.
> Then ₹199/month or ₹1,999/year.
> No ads, ever. Export your data without a subscription while it remains within our retention period.

Clearly show the post-trial price and access policy before users begin. Avoid promising that everything currently available will remain free forever.

## Before implementation

- Validate prices against hosting, database, AI, payment/store deductions, and applicable taxes. MongoDB is currently on the free tier; that alone does not establish sustainable pricing.
- Define paid feature scope and AI allowances.
- Design trial-expiry reminders, subscription purchase/renewal/cancellation flows, and billing-failure handling.
- Define shared-group ownership, member removal, plan switching, and what happens to members when the payer's subscription expires.
- Specify retention reminders, export access, deletion behavior, and what happens when an inactive user returns.
- Confirm supported platforms, billing integration, and exact available price points.

This document records product decisions for future work. It does not authorize implementation, billing activation, or changes to the Notion board.
