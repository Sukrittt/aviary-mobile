# Production launch checklist — subscriptions

Everything that has to happen to turn paid subscriptions on, in order, with
the reasons each step exists. Written during implementation so the reasoning
survives the gap between building this and shipping it.

Design: [payment-subscriptions-plan.md](payment-subscriptions-plan.md).
Product baseline: [pricing.md](pricing.md).

Status legend: `[ ]` not done · `[x]` done · `[~]` in progress

---

## The one thing that is easy to forget

**Every completed onboarding already starts a 30-day trial clock**, from the
moment the backend shipped — not from launch day. Trial creation is
deliberately *not* behind the enforcement flag, because testing the real
thing needs real trial data.

That means a user who signs up between the backend deploy and launch day has
a clock that started weeks early. Some of them would arrive at launch with a
trial that has **already expired**, and be locked out on day one.

`scripts/billing-launch-migration.mjs` is what fixes this. It does two things:

1. Grants a fresh 30-day trial to onboarded users with no billing account.
2. Moves any trial that started *before the launch instant* onto the launch
   window, and re-stamps its cohort as `legacy-launch-v1`.

Both are idempotent. A rerun matches nothing, because the cohort has changed.
A trial that started *after* the launch instant is never touched.

**Run this before flipping `billing.enforced`. With enforcement on and this
unrun, existing users are locked out.**

---

## Phase 1 — Accounts and store setup

### Google Play Console

- [x] App live on Play: `com.sukrit04.envelope`, displayed as Aviary
- [x] Merchant account created (payments profile ending 7646)
- [x] License testing configured for the billing owner account
- [~] BillDesk cross-border KYC — in progress. Gates cross-border sales only,
      **not** the India-only launch.
- [ ] **India payout bank account added.** This is the real blocker. Payments
      profile → "How you get paid" → Manage disbursements under BillDesk.
      Until this is done, the Subscriptions page says "You need to set up a
      Google Payments merchant account to access this page".
- [ ] Create subscription product `envelope_individual`
- [ ] Create two auto-renewing base plans under it
- [ ] Confirm ₹199 and ₹1,999 are accepted price points for this account and
      region. If Play's minimum is higher, pricing.md changes.
- [ ] **No free-trial offer on either base plan.** Our 30-day trial is
      app-managed. A store trial on top would give everyone two.

⚠️ **Naming must be reconciled.** RevenueCat's packages are `monthly` /
`yearly`; payment-subscriptions-plan.md says `monthly` / `annual`. The code
reads both from RevenueCat and hardcodes neither, so either works — but Play
Console needs one consistent answer.

### RevenueCat

- [x] Project and Android app created — `Aviary`, `appdfd7e37e80`
- [x] Play service account credentials, showing Valid
- [x] Google developer notifications (Pub/Sub) connected
- [x] Lifetime/one-time dropped from the default offering
- [x] Webhook created with an Authorization header secret
- [ ] **Verify the webhook URL is the full production domain** plus
      `/api/billing/webhooks/revenuecat`. It was truncated in the console
      screenshot and has never been confirmed end to end.
- [ ] **Confirm the entitlement identifier is literally `aviary_pro`** — the
      identifier, not the "Aviary Pro" display name. Override with
      `REVENUECAT_ENTITLEMENT_ID` if it differs.
- [ ] Map Monthly/Yearly packages to the real Play base plans (needs the Play
      step above first)
- [ ] **Decide the Restore Behaviour setting.** payment-subscriptions-plan.md
      requires that a purchase is never silently transferred to whichever
      account last signed in on a device. This is a product decision that has
      not been made.
- [ ] Swap `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` from the `test_…` Test Store
      key to the real `goog_…` Android key once Play products exist

### Environment variables

| Variable | Where | Status |
| --- | --- | --- |
| `REVENUECAT_SECRET_KEY` | Vercel Production + `Web/.env.local` | [x] |
| `REVENUECAT_WEBHOOK_SECRET` | Vercel Production + `Web/.env.local` | [x] |
| `REVENUECAT_ENTITLEMENT_ID` | Vercel, only if not `aviary_pro` | [ ] |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | `Mobile/.env` + EAS | [x] test key |

🔒 The secret key can read and modify **every** customer's subscription. It
belongs in Vercel and `Web/.env.local` only. It must never be in `Mobile/.env`
— it was, briefly, and was moved out. Only `EXPO_PUBLIC_*` vars are inlined
into the app bundle, so it never shipped in an APK, but do not put it back.

### Gemini API billing — before real users arrive

The AI features (Money Brain chat, daily brief, bill scan, category
suggestions, coach pushes) call Gemini with `GEMINI_API_KEY`. That key is
currently on the **free tier**, which is fine for development and not for
launch, for two reasons that have nothing to do with cost:

- **Shared quota.** `gemini-3.1-flash-lite` on the free tier allows 15
  requests per minute and 500 per day for the whole project (see AI Studio →
  Rate limits). Every user shares it. A few dozen daily users exhaust it,
  and then AI fails for everyone at once.
- **Data terms.** On the free tier Google may use prompts and responses to
  improve its products, with human review. Users' merchants and amounts go
  through those prompts. Paid-tier content is not used that way.

Steps:

- [ ] Google AI Studio → the project that owns `GEMINI_API_KEY` → **Set up
      billing** and link a billing account (this moves it to a paid tier;
      no code or key change).
- [ ] Confirm the tier and higher limits in AI Studio → Rate limits.
- [ ] Set a budget alert on the billing account in Google Cloud so a runaway
      loop cannot surprise you.
- [ ] Look at `/admin/ai` after a week of real usage for cost per user, then
      set **Admin → System → AI allowance** (`aiMonthlyCostUsd`). It is
      empty on purpose: it counts estimated paid-rate dollars, so it means
      nothing while the key is on the free tier.
- [ ] If you change model, update the price in `Web/lib/ai/pricing.ts` so the
      estimate and the cap stay meaningful.

Swapping to a different model does not fix either problem: the tier and its
data terms belong to the key's billing status, not the model.

---

## Phase 2 — Backend deploy (safe ahead of the app)

- [x] `npm run db:indexes` — creates the billing indexes. The unique index on
      `billing_events` is what makes duplicate webhook deliveries a no-op;
      without it, a redelivery double-processes.
- [ ] Merge and push Web to `main` (triggers the Vercel production deploy)
- [ ] Confirm `system_settings.billing` is absent or both flags are false

Deploying the backend while the released app is the only client is safe:
enforcement defaults off, `requireAccess()` returns before touching the
database, and the backend asks nothing new of any client. Verified against
all five released app tags.

### Smoke tests after deploy

```bash
# Migration dry run — read-only, prints counts only
cd Web && node scripts/billing-launch-migration.mjs --at 2026-11-01T00:00:00Z --dry-run
```

- [ ] `GET /api/billing/status` in a signed-in browser → `mode` is
      `setup_incomplete` or `trial`
- [ ] RevenueCat → Webhooks → **Send a test** → a row appears in the
      `billing_events` collection. This proves the URL, the Authorization
      secret, and the middleware exemption all work, with no app build needed.
- [ ] Admin → Jobs → **Billing reconciliation → Run now** succeeds
- [ ] Admin → System shows the two billing toggles, both off
- [ ] Grant yourself an entitlement manually in the RevenueCat dashboard →
      `/api/billing/status` flips to `mode: paid`. This is the full
      webhook → re-verify → entitlement loop without a Play product.

---

## Phase 3 — Mobile release

- [ ] Native rebuild — `react-native-purchases` is a native module, so any
      dev build from before it was added cannot load it
- [ ] Bump the app version in `Mobile/app.json`
- [ ] Test-track build to the closed testing cohort
- [ ] End-to-end purchase with a **license tester** account: product list,
      purchase, backend unlock, renewal, cancellation, restore on a second
      device
- [ ] Release to production
- [ ] Update MongoDB `system_settings` (`_id: "global"`),
      `appUpdate.android.latestVersion` → the released version

⚠️ A Play **license tester's** purchase is recorded as `environment:
sandbox`, and the entitlement resolver honours sandbox rows. That is
intentional for testing, and the blast radius is limited to the emails listed
in Play Console — but it does mean a sandbox purchase grants real access.
Revisit if the tester list ever grows beyond people you trust.

---

## Testing against production without affecting real users

The two switches only reach **billing testers** until `billing.audience` is
`everyone`. The admin page shows this as "Apply to everyone (production)",
and it is off by default. An absent value also means testers-only, so no
toggle can reach real users by accident.

1. `cd Web && npm run billing:tester -- --email you@example.com`. Undo with
   `--revoke`.
2. Admin → System → turn on the purchase and/or enforce switches. Leave
   **Apply to everyone** off.
3. Signed in as the tester, you get the full trial and paywall flow. Every
   other account behaves as if both switches were off. That includes the
   released app, which never sees a 402.
4. Other instances pick up changes within 30 s, the settings cache TTL.

## Phase 4 — Flip the switches

**Order matters. Do not reverse these.**

0. [ ] **Gemini billing is on** (see "Gemini API billing" above). Real users
       must not share the free tier's 500-requests-a-day pool or send their
       expense data through its data terms.

1. [ ] **Run the launch migration for real.** Pick the launch instant, run
       the dry run first, check the counts against the admin user list, then:

   ```bash
   cd Web && node scripts/billing-launch-migration.mjs --at <ISO instant>
   ```

   Note the arg form is `--at <value>`, space-separated — `--at=<value>` is
   not parsed.

2. [ ] **Admin → System → Show purchase options** (`purchaseEnabled`). This
       reveals checkout in the Android app. Nobody is locked out by this on
       its own, so it is safe to leave on for a while and watch.

3. [ ] Confirm real purchases work and appear in `billing_subscriptions`

4. [ ] **Admin → System → Enforce subscription access** (`enforced`). This is
       the one that can lock people out. Everything above must be true first.

5. [ ] **Admin → System → Apply to everyone (production)** (`audience:
       everyone`). Until this is on, steps 2 and 4 only reach billing
       testers. Turning it back off returns every non-tester to the
       pre-launch behaviour at once.

Rolling back `enforced` restores access immediately and preserves all billing
history — store events keep being processed either way.

---

## Still to build before flipping `enforced`

These are not optional; pricing.md and the plan both commit to them.

- [x] **Trial reminder pushes** at 7 / 3 / 1 days remaining (daily billing
      cron, `Web/lib/billing/lifecycle.ts`).
- [x] **Retention job** — built: sets `retentionDeadline`, sends 30 / 7 / 1
      day notices, and only deletes when **Admin → System → Delete accounts
      after the retention window** is on (off by default; when off it
      reports what it would delete in the cron result). Decide when to
      enable it.
- [~] **AI allowances.** Mechanism built (per-user monthly cap, 429
      `AI_ALLOWANCE_EXCEEDED`, dedicated mobile screen). The number is still
      unset: choose it after Gemini billing is on and `/admin/ai` shows real
      usage.
- [x] **Client UI** — restricted-account screen, subscribe screen, trial
      countdown, web "Subscribe in the Android app", widget/cache behaviour
      after expiry, pending local expenses included in an export. (Mobile
      2.4.0+ has it; Web has it on `main`.)

Deferred past launch by decision, not oversight:

- Shared plan (`billing_groups`, up to five members) — Individual first
- iOS checkout — out of launch scope
- Any separate web payment gateway — Play billing only

---

## Things to decide before launch, not during

- Restore Behaviour in RevenueCat (see Phase 1)
- Exact AI allowances, measured from real usage on the paid Gemini tier rather than guessed
- Whether ₹199 / ₹1,999 survive a real cost check against hosting, database,
  blob storage, AI, Play's 15% fee, RevenueCat's fee, and taxes
- Launch countries — India only at first
- Whether sandbox purchases should keep granting production access

---

## Rollback

| Situation | Action |
| --- | --- |
| Users wrongly locked out | Turn off `enforced`. Immediate, no deploy. |
| Checkout broken | Turn off `purchaseEnabled`. Nobody loses access. |
| Webhooks failing | Events are stored on arrival; the daily reconciliation cron repairs the projection. Check Admin → Jobs. |
| Provider outage | Already handled — an outage returns existing access, never a downgrade. |

Never roll back by deleting billing records. Enforcement can be turned off
without losing history; store events must keep being processed regardless.
