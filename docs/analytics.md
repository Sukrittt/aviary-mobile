# Analytics

Both apps send to one PostHog project. Mobile via `src/lib/analytics.ts`, web via
`Web/src/lib/analytics.ts`. The `AppEvent` union is identical in both, so one event
name means one thing everywhere. Every event carries `platform` (`android`, `ios`,
`web`) and, once billing status loads, `plan_status` (`trial`, `paid`, `expired`,
`setup_incomplete`).

The person id is the WorkOS user id on both apps. Name and email go on the person
record. Nothing else personal does: no amounts, item names, merchant strings,
category names, notification text or raw error messages in any property.

## Events

### Sign-in
| Event | Properties | Where |
|---|---|---|
| `sign_in_started` | `method`: google, email | Google button, email submit |
| `sign_in_code_sent` | | email code sent |
| `sign_in_failed` | `method`, `reason`: cancelled, provider_error, missing_verifier, token_exchange_failed, code_send_failed, wrong_code, network | |
| `sign_in_completed` | `method` | after the session is stored (mobile); after code verify (web) |

### Onboarding
| Event | Properties |
|---|---|
| `onboarding_started` | |
| `onboarding_step_viewed` | `step` 0 to 4, `step_name`: currency, income, groups, categories, assign |
| `onboarding_step_completed` | `step`, `step_name`, `seconds_on_step`, plus one of: `currency`; `used_quick_pick`; `groups_selected`, `groups_added`, `groups_renamed`; `categories_selected`; `edited_split` |
| `onboarding_back_tapped` | `from_step`, `step_name` |
| `onboarding_failed` | `reason`: save_failed |
| `onboarding_completed` | `total_seconds`, `groups_count`, `categories_count`, `currency`. Fires when the save lands, not on the celebration CTA |
| `tour_started` / `tour_completed` | `fresh` (straight after setup) |
| `tour_step_viewed` | `chapter` |
| `tour_skipped` | `fresh`, `chapters_done` |

### Features
| Event | Properties |
|---|---|
| `expense_logged` | `payment_method`, `has_notes`. Also sets `first_expense_at` on the person, once |
| `expense_edited` | `fields` (field names, comma-joined), `changed_category` |
| `expense_deleted` | |
| `ai_category_suggested` | `accepted` (kept the auto-pick at save), `source`: keyword, ai |
| `money_moved` | `sources_count` |
| `envelope_created` | `grouped` |
| `duplicates_resolved` | `action`: deleted, kept_both |
| `bill_scan_started` / `bill_scanned` / `bill_scan_failed` | `items_count` / `reason`: ai_allowance, error |
| `money_brain_opened` | |
| `money_brain_query` | `source`: chip, typed |
| `money_brain_answered` | `ok`, `seconds`, `reason` |
| `ai_allowance_hit` | `feature`: brief, chat, scan |
| `recurring_created`, `recurring_suggestion_accepted`, `recurring_suggestion_dismissed` | |
| `holding_added` | |
| `subscription_added` | `billing_cycle` |
| `wrapped_opened` | `muted` |
| `wrapped_card_viewed` | `index` (once per card per visit) |
| `wrapped_shared` | share sheet opened |

### Paying (mobile only)
| Event | Properties |
|---|---|
| `paywall_viewed` | `trigger`: plan_screen, access_expired; `plan_status` |
| `purchase_started` / `purchase_cancelled` | `package` |
| `purchase_completed` | `package`, `verified`, `pending` |
| `purchase_failed` | `package`, `error_code` (store code, never the message) |
| `restore_tapped` / `restore_succeeded` | `plan_status` |

Renewals, cancellations and billing issues happen with the app closed. Turn on
RevenueCat's PostHog integration (RevenueCat → Integrations → PostHog, app user
id = WorkOS id) to get those as server-side events on the same person.

### Notifications and account
| Event | Properties |
|---|---|
| `push_permission_result` | `granted`. Only when the OS prompt was shown |
| `push_registration_failed` | `stage`, `error` |
| `notification_opened` | `target` (route, `activity_date` or `none`) |
| `data_exported` | |
| `account_deleted` | flushed before the logout reset |
| `feedback_sent` | `type` |
| `store_cta_clicked` (web) | `placement`: hero, platforms, footer_cta |

Screens (mobile, `$screen`, path only) and pages (web, `$pageview`, query string
stripped) come on top of these.

## Dashboards to build

1. **Onboarding funnel**: `onboarding_started` → `onboarding_step_completed` for
   each `step_name` → `onboarding_completed`. Break down by `platform`. Median
   `seconds_on_step` per step shows where it drags.
2. **Activation**: `onboarding_completed` → `expense_logged` within 1 day →
   3 × `expense_logged` within 7 days.
3. **Retention**: weekly, returning on `expense_logged`.
4. **Feature use**: trends of `$screen` by `$screen_name`, plus the feature events
   above, by unique users.
5. **Paywall**: `paywall_viewed` → `purchase_started` → `purchase_completed`
   (`verified = true`), by `trigger`.

## Known gaps

- Mobile skips events while offline instead of queueing them (see `track()`), so
  counts under-report people on patchy connections, offline expense logging
  included.
- Web Google sign-in completes in a server redirect, so web has no
  `sign_in_completed` for `method = google`. `identify` still fires on arrival.
