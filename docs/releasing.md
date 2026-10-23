# Releasing Aviary (Android)

Two ways to ship:

| Change | How it ships | Users need to |
| --- | --- | --- |
| JS, UI, copy, images/fonts bundled by Metro | **OTA update** (`eas update`) | Nothing. It arrives on its own |
| Native: new/upgraded native dependency, Expo SDK bump, `app.json` plugins/permissions, icon, splash, widgets, `google-services.json` | **Store build** (`eas build` + Play) | Update from the Play Store |

## How OTA works here

- `expo-updates` is configured in `app.json` with `runtimeVersion.policy: "appVersion"`.
  An OTA update only reaches installs whose **native version equals `expo.version`** at publish time.
  Store build 2.6.0 only ever receives updates published while `app.json` says 2.6.0.
- Each build profile in `eas.json` has a channel: `development`, `preview`, `production`.
  An update published to a channel only reaches builds from that profile.
- On launch the app checks for an update, downloads it in the background, and applies it on the
  **next cold start**. So most users get it on their second open.
- Publishing again replaces the previous update. Users jump straight to the latest. Updates don't stack.
- OTA doesn't change the app version. v2.6.0 stays v2.6.0 in the More tab.

## Rolling out an OTA update

1. **Make sure it's JS-only.** Compare against the last store tag:
   ```sh
   git diff v.2.6.0 -- package.json app.json app.config.js plugins/ assets/
   ```
   Any native change (see table above) means **stop, do a store build instead**. Publishing native
   changes over the air crashes users on launch, because their binary lacks the new native code.
   Don't bump `expo.version` for an OTA. Bumping it means old installs never receive the update.
2. Commit the change. Run `npm run typecheck && npm run lint && npm test`.
3. **Test on preview first** (needs a preview build of the same version installed):
   ```sh
   eas update --channel preview --environment preview -m "fix: <what changed>"
   ```
   Open the app twice on the device (kill it between opens) and check the fix.
4. **Publish to production:**
   ```sh
   eas update --channel production --environment production -m "fix: <what changed>"
   ```
   `--environment production` bundles the `EXPO_PUBLIC_*` values stored in EAS, not your local `.env`
   (which may point at the dev API).

   For a risky change, stage it:
   ```sh
   eas update --channel production --environment production --rollout-percentage 10 -m "..."
   eas update:edit            # raise the percentage once it looks healthy
   ```
5. **Watch it:** `eas update:insights` (launches, crashes) and PostHog errors.
6. **Announcing it?** In Web admin **Changelog**, set **Ships in an OTA published after** (UTC) to a
   time between the previous OTA and this one. Leave the version label as the current version or empty.
   What's new then waits until the user's running bundle is this update (their next cold start),
   instead of announcing a feature the first open hasn't applied yet.

### Something broke

```sh
eas update:republish     # pick the previous good update group
eas update:revert-update-rollout   # if it was a staged rollout
eas update:roll-back-to-embedded   # back to what shipped in the store build
```
Users get the rollback on their next launch.

## Rolling out a store build (native change)

1. Bump `expo.version` in `app.json` (e.g. 2.6.0 to 2.7.0). `versionCode` auto-increments on EAS.
2. `eas build -p android --profile production` then `eas submit -p android --profile production`.
3. Promote it in Play Console once it passes review. Tag the commit `v.2.7.0`.
4. Publish the changelog entry. The in-app Changelog and What's new card read MongoDB `web_changelog`,
   not this repo, so nothing reminds you if you skip this. In Web admin **Changelog**, add a **Mobile**
   release with version `v2.7.0` (highlights from `git log` since the previous version bump), then publish it.
   Check that the newest entry in More > Changelog matches the version in More before moving on.
   Then update MongoDB `system_settings` (`_id: "global"`) via Web admin **System** page:
   - `appUpdate.android.latestVersion` = `2.7.0`. Shows a quiet "Update available" link on the More tab.
   - `appUpdate.android.minVersion` = `2.7.0` **only if** older installs must move (they'll stop getting
     OTA fixes, or the backend needs the new build). Shows a non-dismissable banner on Home.
     Leave it alone for optional releases.
5. From now on, OTA updates published from this code reach only 2.7.0 installs. If an urgent fix must
   also reach 2.6.0 users, check out the `v.2.6.0` tag, apply the fix there, and publish from that
   checkout (its `app.json` still says 2.6.0).
