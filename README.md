# Aviary for Android

**Open-source envelope budgeting, built for rupees.** Give every rupee a job, log a spend in three taps, and see what's safe to spend at a glance.

[Get it on Google Play](https://play.google.com/store/apps/details?id=com.sukrit04.envelope) · [Web app](https://ynab-replacement.vercel.app) · [Web + API repo](https://github.com/Sukrittt/aviary)

<p align="center">
  <img src="https://raw.githubusercontent.com/Sukrittt/aviary/main/public/landing/home.jpeg" width="200" alt="Home" />
  <img src="https://raw.githubusercontent.com/Sukrittt/aviary/main/public/landing/envelopes.jpeg" width="200" alt="Envelopes" />
  <img src="https://raw.githubusercontent.com/Sukrittt/aviary/main/public/landing/log-expense.jpeg" width="200" alt="Log expense" />
  <img src="https://raw.githubusercontent.com/Sukrittt/aviary/main/public/landing/insights.jpeg" width="200" alt="Insights" />
</p>

## Why Aviary

- **YNAB-style method, priced for India.** Envelope budgeting with Ready to Assign, rollovers, and moving money between envelopes — in INR, without a dollar subscription.
- **Native mobile app.** Not a PWA; shares one account with the web dashboard.
- **AI that knows your spending.** Ask Aviary chat, anomaly alerts, and a year-end Wrapped recap.
- **Open source.** Every line that touches your financial data is public and auditable.

## About this repo

Expo/React Native app for Aviary. Talks to the same deployed API as [`Sukrittt/aviary`](https://github.com/Sukrittt/aviary).

## Stack

- Expo SDK 57 + Expo Router (file-based routing, `app/`)
- React 19 / React Native 0.86
- TanStack Query for data fetching
- expo-secure-store for token persistence
- expo-auth-session for Google sign-in (PKCE, no client secret in the bundle)
- Reanimated + gesture-handler for swipeable rows and sheets; SVG charts

## Features

- **Envelopes** — category groups with monthly budgets, Ready to Assign, move money between envelopes, inline category creation, drag reordering.
- **Activity** — transaction log with swipe-to-delete.
- **Investments** — holdings, contributions/withdrawals via modals.
- **Ask Aviary** — AI chat about your spending (`src/api/ai.ts` → `/api/ai/chat`).
- **Wrapped** — year-in-review recap screen (`app/wrapped.tsx`) backed by `/api/wrapped`.
- **Account** — profile edit, real email change with code verification, linked identities (Google/email), active sessions with remote revoke, delete account with in-app confirm sheet, data export, help.

## Structure

```
app/            routes (expo-router)
  (auth)/       welcome.tsx, email.tsx, code.tsx — sign-in flow
  (tabs)/       index (home), envelopes, activity, more
  account/      data.tsx, security.tsx, help.tsx
  modals/       log-expense, move-money, category-manager, subscription,
                add-holding, holding-action, money-brain
  investments.tsx, onboarding.tsx, wrapped.tsx
src/api/        fetch wrappers per resource (budgets, expenses, holdings,
                groups, categories, subscriptions, wrapped, ai, account,
                notifications, workos, magicAuth, accessMode, client)
src/hooks/      TanStack Query hooks wrapping src/api
src/components/ envelope, charts, nav, activity, auth, brain, onboarding,
                subscriptions, wrapped, shared UI
src/context/    PrivacyContext
src/theme/      tokens, fonts, ThemeProvider
src/lib/        format/emoji/envelope helpers
```

`src/api/client.ts` and `src/api/accessMode.ts` are ports of `Web/src/services/api.ts` and `accessMode.ts` — same real/guest auth model, but SecureStore is async so `initAccessMode()` must be awaited once at boot before rendering past the splash screen.

## Setup

```bash
npm install
npm start        # expo start
npm run ios      # expo run:ios
npm run android  # expo run:android
npm run web      # expo start --web
```

## Environment

- `EXPO_PUBLIC_API_URL` — API base URL. Falls back to `https://ynab-replacement.vercel.app` in a release build; in a dev build (`__DEV__`), leaving it unset throws at startup instead of silently pointing at production data — set it in `.env` (gitignored).
- `EXPO_PUBLIC_WORKOS_CLIENT_ID` — WorkOS client id for Google PKCE sign-in.
- `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` — RevenueCat *public* SDK key for Google Play checkout. Public by design: it can only read and start purchases for the signed-in customer. The secret key lives server-side in Web and must never appear here. Unset simply disables checkout — the server still decides access, so the app degrades rather than breaking.

`google-services.json` (repo root, referenced by `app.json`'s `googleServicesFile`) is gitignored — keep it on disk locally (the build needs it) but never commit it. Android Firebase API keys are semi-public by design, but restrict it in the GCP console (Credentials → the key → API restrictions) to just the APIs this app actually calls, rather than leaving it unrestricted.

## Auth

Two paths, both against WorkOS:

- **Google** — PKCE flow straight from the device via `expo-auth-session` (`src/api/workos.ts`, `useSignIn.ts`); no client secret baked into the app.
- **Email** — 6-digit magic-auth codes sent through the deployed API's `/api/auth/magic-auth/*` endpoints (`src/api/magicAuth.ts`), since that flow needs the server-side API key.

Real mode stores a WorkOS token pair (access + refresh) in SecureStore; expired access tokens are refreshed transparently, and rotated refresh tokens are persisted immediately (`src/api/accessMode.ts`). Guest mode sends no auth header. The Account & security screen lists active sessions (with device labels from `expo-device`) and can revoke them.

## Notes

Expo 57 API surface differs from older docs — check `https://docs.expo.dev/versions/v57.0.0/` before assuming behavior (see `AGENTS.md`).

## License

Copyright (c) 2026 Sukrit Saha. Licensed under the [GNU Affero General Public License v3.0](LICENSE). If you run a modified version of Aviary as a service, you must publish your source code under the same license.
