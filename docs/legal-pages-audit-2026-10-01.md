# Legal pages audit — 1 October 2026

**Result: corrections needed before treating these pages as accurate.** The newer legal pages are deployed to staging, while production still serves the older version. Several statements in both versions contradict the current implementation.

## Scope and evidence

Reviewed all six legal routes in `Web/app/legal`, mobile links and disclosures, and the relevant API, encryption, receipt storage, export, billing, and account deletion code. Inspected public pages without signing in on the production Vercel domain, `www.useaviary.com`, and staging. Reviewed current Google Play and Gemini policies and official privacy-law sources.

This checks published statements against observable pages and source code; it does not certify legal compliance. Production build contents, provider contracts/settings, support mailbox delivery, tax treatment, and store-console declarations were not available for verification. No account was deleted and no payment was made. The Mobile Graphify index was marked stale; its semantic output was not used as evidence for findings.

## Deployment check

| Route | Production Vercel domain | www.useaviary.com | Staging |
|---|---|---|---|
| `/legal/privacy` | 4 September version | Same older version | 27 September version |
| `/legal/terms` | 4 September version | Not independently inspected | 27 September version |
| `/legal/delete-account` | Available | Not independently inspected | Available |
| `/legal/pricing` | 404 page | 404 page | Available; ₹199/month, ₹1,999/year |
| `/legal/refunds` | 404 page | 404 page | Available |
| `/legal/contact` | 404 page | 404 page | Available |

Mobile development currently points at staging. Release code falls back to `https://ynab-replacement.vercel.app`; a build-time override can change that. Legal links follow this API URL. See [client.ts](../src/api/client.ts:20) and [welcome.tsx](../app/(auth)/welcome.tsx:182).

## Findings

### 1. High — production legal pages are missing or outdated

Production pricing, refunds, and contact routes show 404 pages. Its privacy policy omits Razorpay, Google Play, and RevenueCat, and its terms cover only Google Play billing. Staging/local copies include web billing. Publishing the current local pages alone will not resolve the content errors below.

**Action:** correct the local content, deploy it to production, then recheck all public routes and the URLs baked into the released mobile app.

### 2. High — receipt-photo storage claim is false for the current app

The [privacy policy](../../Web/app/legal/privacy/page.tsx:37) says scanned photos are not stored afterward. Mobile confirmation saves the original image and reviewed receipt data through `/api/bills`; [billScan.ts](../../Web/lib/billScan.ts:34) writes the photo to private Vercel Blob storage. Account purge removes those blobs. This is a confirmed mismatch in the current implementation and staging policy; production feature deployment was not independently verified.

**Action:** distinguish the temporary scan request from saved receipts. Disclose the photo, extracted items, storage provider, access protections, retention, and deletion behavior.

### 3. High — an AI recipient and several processing purposes are omitted

The policy names Gemini but does not identify TypeSafe AI/Jev through Vercel AI Gateway. [jev.ts](../../Web/lib/ai/jev.ts:36) sends expense descriptions and category choices, holding names, chat messages/history, and financial summaries through its callers. Automatic categorization and duplicate detection can involve AI without the user starting an Ask Aviary conversation.

**Action:** disclose the additional provider and gateway, the information each feature sends, and the automatic processing purposes. Verify the providers' retention and subprocessors rather than assuming the Gemini wording applies to them.

### 4. High — deletion and retention promises are incomplete

The policy and account-deletion page imply permanent removal after seven days. [accountLifecycle.ts](../../Web/lib/accountLifecycle.ts:101) explicitly retains billing subscription records containing user and transaction identifiers. The purge does not request deletion from PostHog or RevenueCat. Existing analytics records therefore are not shown to be erased by deleting an Aviary account. Backups, logs, exported files, and provider retention periods are not explained.

Seven days is also an eligibility window followed by a daily cleanup job; provider failures can delay completion. Deleting an individual transaction does not establish that its saved receipt photo is also erased: bill images remain until account cleanup in the current code.

**Action:** state which budgeting data is removed, the recovery window and scheduled cleanup, which records remain and why, and their retention periods. Decide and implement the intended analytics/provider deletion process. Google Play requires necessary retention exceptions to be disclosed. [Google Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311).

### 5. Medium — export availability is overstated

[Terms](../../Web/app/legal/terms/page.tsx:68), privacy, and refunds promise exports at any time. [exports.ts](../../Web/lib/exports.ts:66) caps normal full exports at three per month and permits exactly one new export after access expires. Once consumed, a lapsed account cannot generate another through that route.

**Action:** disclose the self-service limits and provide a support route for data-rights requests, or change the implementation to honor the published promise. Separate generating a new export from downloading an existing one.

### 6. Medium — support addresses differ

Privacy, terms, and deletion use `support@useaviary.com`. Contact and refunds use `aviary.playreview@gmail.com`. Neither mailbox's delivery or forwarding was tested.

**Action:** choose one public support/privacy address, or clearly label distinct billing and privacy contacts. Centralize the constants. Make the external deletion request address clickable and provide an identity-verification alternative for users who have lost access to their original email.

### 7. Medium — encryption assurance is too broad

The security paragraph says a database leak only exposes ciphertext, although the same policy and [encryptedFields.ts](../../Web/lib/encryptedFields.ts:15) establish that dates, category names, payment methods, subscription/holding names, and other metadata remain readable. Account and billing identifiers also are not covered by that field-encryption map. Receipt images and exported workbooks do not pass through this AES-256-GCM field-encryption layer.

**Action:** describe exactly which database fields receive application-layer encryption. State that other metadata remains readable. Describe Blob storage separately; do not imply that the field-encryption guarantee covers every stored artifact. The existing explanation that this is not end-to-end encryption is correct.

### 8. Medium — legal-rights wording needs qualification

The India paragraph presents DPDP rights as already operative. The official commencement notification phases sections 11–17 in eighteen months after publication in November 2025; this audit is earlier than that. These rights can still be offered voluntarily, but the wording should distinguish that commitment from statutory commencement. [Government commencement notification](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf).

The EU/UK/California sentence treats distinct laws as equivalent and says not selling data means there is nothing to opt out of. California also addresses qualifying sharing and other rights, and applicability has business thresholds. GDPR rights and notice requirements need their own assessment. [California Attorney General guidance](https://oag.ca.gov/privacy/ccpa), [European Commission guidance](https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en).

**Action:** qualify rights by applicable law, accurately describe voluntarily available controls, and establish a documented request/grievance process. Have counsel review jurisdictional applicability and consumer rights before claiming compliance.

### 9. Verification required — Gemini training and retention promise

The policy's no-training assertion depends on the production project's provider arrangement. Google's current terms distinguish projects with active Cloud Billing from unpaid services; unpaid-service terms permit product improvement and warn against submitting sensitive information. Paid services still have limited safety/legal logging. Code using an API key does not prove which arrangement applies. [Gemini API terms](https://ai.google.dev/gemini-api/terms).

**Action:** confirm active billing/provider terms for the production project without exposing credentials, then write the policy to match the verified arrangement and retention terms.

### 10. Review required — prominent disclosure and consent

Analytics begins by default and attaches name/email, with a later settings opt-out. The receipt flow requests camera/library permission and sends the image to AI without naming Gemini or explaining receipt storage in the picker. A privacy-policy link alone does not establish that sensitive sharing meets user expectations or any required consent standard.

**Action:** assess consent requirements for supported regions and Google Play. Add disclosures before unexpected sharing, including automatic AI suggestions; obtain affirmative consent where required. Google Play's requirements apply when sensitive processing falls outside reasonable user expectations. [Google Play disclosure and consent policy](https://support.google.com/googleplay/android-developer/answer/10144311).

### 11. Medium — commercial terms need clearer boundaries

Pricing includes AI features without explaining that configurable monthly AI allowances can stop them. The terms restrict resale and reverse engineering without distinguishing use of the hosted service from rights in the separately AGPL-licensed source. The deletion page omits the subscription-cancellation distinction already present in terms: web subscriptions are cancelled by account deletion, Google Play subscriptions require separate cancellation.

**Action:** disclose meaningful AI usage limits, preserve open-source license rights explicitly, and repeat cancellation consequences where users initiate or read about deletion. Clarify that refund exclusions and liability/jurisdiction clauses do not override mandatory consumer rights. Operator legal identity, business contact/address, and grievance details also need assessment for the paid service; the pages currently identify only an unnamed developer in India. Applicable Indian e-commerce disclosure requirements should be reviewed with counsel. [Department of Consumer Affairs rules](https://consumeraffairs.nic.in/sites/default/files/E%20commerce%20rules.pdf).

## Checks that passed

- All six staging pages load publicly without an account, and their internal links target the expected legal routes.
- Staging pricing loads provider-derived prices; the displayed annual saving of 16% is consistent with ₹199 × 12 versus ₹1,999.
- The staging privacy page fits a 390px viewport without horizontal overflow and grows vertically to show the full text and six footer links.
- Existing web legal-layout regression test passed: one test in `app/legal/legal-layout.test.ts`.
- Mobile has privacy/terms links on welcome and a legal link under More. Analytics opt-out exists under More → Your data.
- The code has a seven-day recovery window, account-email confirmation, and account/WorkOS/blob cleanup paths. Production execution was not exercised.
- Current terms correctly distinguish web and Google Play cancellation and state that the trial does not automatically charge.

## Remaining external checks

Verify support delivery, provider billing/contracts and retention, production cleanup-job success, the actual release API/legal URL, Google Play Data safety declarations, target audience/age settings, and the claim that advertised prices include applicable taxes. These require operational or store-console evidence beyond public pages and source.
