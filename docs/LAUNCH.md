# Aviary launch checklist

Target: public launch end of October 2026. Status legend: `[ ]` not done · `[x]` done · `[~]` in progress

Positioning: affordable, open-source, YNAB-style envelope budgeting for India (₹1,999/yr vs YNAB ~$109/yr), with AI (Money Brain, anomaly alerts, Wrapped).

## 1. Repo level

- [x] README header (Web + Mobile): pitch, Play Store / web links, screenshots, "Why Aviary". Dev docs kept below. Revisit links after rename + domain.
- [x] `CONTRIBUTING.md` in both repos (setup, branch/PR flow, test expectations)
- [x] 13 issues opened (12 `good first issue`, 1 `help wanted` self-hosting). Security audit findings kept private.
- [x] License: AGPL-3.0-only in both repos (LICENSE, package.json, README)
- [x] Rename GitHub repos: `envelope` → `aviary`, `envelope-mobile` → `aviary-mobile` (GitHub auto-redirects old URLs; update local remotes)
- [x] Repo description + topics (add `self-hosted` once self-hostable)
- [ ] Social preview image (1280×640) for both repos
- [ ] Issue / PR templates

## 2. Open source vs paid story

- [ ] State the model in README: code is open and free to self-host; paid plan = hosted app, sync, AI, support
- [ ] Self-host path: `docker-compose` (app + MongoDB), make WorkOS / Gemini optional or document them
- [ ] Self-hosting guide in `docs/`

## 3. Domain + landing

- [ ] Buy domain — recommended `useaviary.com` ($11.25/yr flat). Avoid `aviary.website` ($1.99 then $22/yr renewal, spammy TLD hurts email deliverability)
- [ ] Point domain at Vercel project; update `EXPO_PUBLIC_API_URL` fallback, WorkOS redirect URIs, Play Store listing
- [ ] Landing page (exists: `Web/public/landing`) — add waitlist form
- [ ] Waitlist email tool (Buttondown / Loops / Resend)

## 4. Waitlist

- [ ] Collect emails from now until launch
- [ ] 1–2 pre-launch update emails (progress clips, screenshots)
- [ ] Launch-day invite email with perk: extended trial (60 days) or founding-member price lock
- [ ] Ask waitlist for Product Hunt upvote + Play Store review on launch day

## 5. Build in public (now → launch)

- [ ] Accounts on X / Bluesky; post weekly clips (`brag-output/brag.mp4`, screenshots, redesign before/after)
- [ ] "How I built it" draft post (Dev.to / Hashnode / IndieHackers)

## 6. Launch week (stagger across days)

- [ ] Show HN — Tue–Thu, US morning: "Show HN: Aviary – open-source envelope budgeting app (web + Android)"
- [ ] Reddit: r/selfhosted (only once self-hostable), r/opensource, r/IndiaInvestments, r/personalfinanceindia, r/reactnative, r/nextjs. Check r/ynab self-promo rules first.
- [ ] Product Hunt (separate day) with video + screenshots
- [ ] PR to awesome-selfhosted (Money, Budgeting & Management) and awesome-react-native
- [ ] Publish "how I built it" post

## 7. Post launch

- [ ] Reply to every comment / issue within a day
- [ ] Changelog per release, posted as content
- [ ] Share milestones (stars, first contributor PR)
