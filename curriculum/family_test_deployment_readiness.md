# Controlled Family-Test Deployment Preparation

Status: **preparation only. Not deployed. Not approved.** This document
is the operational companion to `family_test_account_smoke_test_plan.md`
and to step 11.4's gap-analysis entry — it covers the deployment
mechanics (what to run, in what order, how to undo it) rather than the
account-level verification checklist.

## 1. One-time family data bootstrap vs. code deployment vs. normal teacher workflow

Keep these three strictly separate — they happen at different times, by
different people, with different reversibility:

**CODE DEPLOYMENT** (this document's main subject) — pushing this
repository's current Hosting/Functions/Rules/Indexes to the live Firebase
project. Reversible (see section 3). Performed by whoever has real
project access; not performed by this sandbox (no credentials here).

**ONE-TIME FAMILY DATA BOOTSTRAP** — operations against existing live
Firestore data that must happen once, after code deployment, before the
first family test, and are NOT re-run casually:
- Add `"systemRole": "owner"` to Cory's entry in the real, gitignored
  `scripts/accounts.config.json`, then run `npm run seed` (idempotent —
  safe to re-run, only ever adds/updates fields an entry explicitly
  names; never demotes or infers).
- Confirm all 5 accounts exist with correct `familyId`/`role`/
  `presentationIdentityId` (same seed script covers this if not already
  done; also idempotent).
- `bootstrapExistingCertifications` (if Q1 isn't already certified in
  the live project) — a one-time governance activation, not something
  run per day.
- Confirm `governanceMode` is set to `"governed"` for the family (part
  of the same certification bootstrap).

**NORMAL TEACHER WORKFLOW** (ongoing, every school day, not a bootstrap
step) — certify a week if not already certified, generate the two-day-
ahead proposal, review/edit/approve it (this is what actually creates a
`publishedDays` entry a student can see), and at day's end open/edit/
approve the evidence packet. This is the loop the family test is meant
to exercise, not a setup step to perform once.

## 2. First family-test sequence

Run in this order, each stage gated on the previous one working:

1. **Cory + Sarah — verify teacher dashboards.** Both sign in, both land
   on the teacher dashboard, both see the same 3 students and the same
   family-wide pace/hour data. Cory additionally sees the "Account
   Administration" nav item; Sarah does not.
2. **Sarah certifies the week and generates + approves at least one
   two-day-ahead proposal** for each of the 3 students, so there is
   something real for each student to see in stage 3. (Doing this as
   Sarah first, not Cory, is itself a live confirmation that ordinary
   teacher work needs no owner authority.)
3. **Each student, individually:**
   - Sign in; confirm identity (own name, own presentation identity —
     Kira/Ro/Nova — never a sibling's).
   - Confirm they see only their own approved day, never a sibling's.
   - Complete or mark at least one LearningBlock.
   - Use Ask for Help once (confirm it reaches the teacher queue).
   - Confirm PE behavior: the PE/movement block is present, required,
     and does not appear to count toward or block any hour total.
   - Confirm the Historical Figure closing section shows an honest "not
     available yet" state rather than any placeholder image, alongside
     the real discussion/recall prompt.
4. **Sarah — closeout.** Receive and respond to the help request from
   stage 3. Open the closeout/evidence packet for each student who
   worked. Verify each student's block-level progress appears correctly
   (not blank, not another sibling's). Adjust/approve evidence and
   minutes. Verify the resulting hour projections update correctly on
   the teacher dashboard.
5. **Cory — owner-only checks, non-destructive.** Confirm `/account-admin`
   is reachable and shows the correct 5-person roster with live Auth
   metadata. Confirm Sarah cannot reach it (both the missing nav item and
   a direct server-side call being rejected — see
   `family_test_account_smoke_test_plan.md` Part C for the exact check).
   **Do not test password or email mutation in this pass** unless Cory
   separately, explicitly approves that specific destructive test on his
   own account first.

Stop and report immediately if any stage fails rather than continuing
past it — a later stage's success doesn't retroactively validate an
earlier failure.

## 3. Failure / rollback plan

**How to tell a deployment failed:** the `firebase deploy` command's own
exit status and per-target summary (it reports Hosting/Functions/Rules/
Indexes success or failure separately — a partial failure is possible,
e.g. Hosting succeeds while a Functions build error blocks that target).
For Functions specifically, also check `firebase functions:log` for
runtime errors in the minutes after deploy (e.g. a missing
`ANTHROPIC_API_KEY` secret would surface as a 500 the first time
`generatePlan`/`generateProposedDays`/`parseExtracurricular` is called,
not at deploy time itself).

**Reverting Hosting:** Firebase Hosting keeps prior releases; the
fastest rollback is `firebase hosting:rollback` (or re-deploying the
prior commit's `web/dist` build) — this is fast and safe, Hosting
rollback does not touch any data.

**Reverting Functions:** re-deploy the prior commit's `functions/`
source (`git checkout <prior-good-commit> -- functions && firebase
deploy --only functions`). There is no built-in "rollback" button for
Functions the way Hosting has one — it's a forward redeploy of the old
code. A function that's misbehaving can also be deleted individually
(`firebase functions:delete <name>`) as a faster stop-gap if a full
redeploy isn't immediately possible, but that removes the capability
entirely until the next deploy, so prefer redeploying the old source.

**Restoring prior Rules:** `firebase deploy --only firestore:rules`
using the prior commit's `firestore.rules` (`git show
<prior-commit>:firestore.rules > firestore.rules` then deploy, or check
the Firebase Console's Rules history/versioning, which keeps prior
published versions and can restore one directly without touching git at
all). Rules changes take effect immediately and are naturally
"reversible" this way with no data impact — a rules rollback affects
only what's allowed to be read/written going forward.

**Data written under bad rules or a bad function is NOT automatically
reversed by any of the above.** Specifically:
- If a bug wrote or corrupted a `publishedDays`, `studentBlockProgress`,
  or `evidencePackets` document, rolling back the code does not undo
  that write — the bad document is still there and needs manual
  correction (Console or an admin script) or, if truly disposable
  (nothing of family value in it yet), manual deletion.
- `masteryRecords`, `masteryApplications`, and `auditEvents` are
  explicitly designed to be traceable/historical — do not delete these
  to "fix" a test artifact; correct forward instead (a new record, not
  an edited or removed old one) so the trail stays honest.
- A `systemRole` field, once correctly bootstrapped, should never need
  reverting — there is no code path that would legitimately change it
  outside the seed script, so any unexpected value there is itself the
  incident, not something to "roll back" casually.

**Stopping a family test without corrupting approved historical
records:** simply stop using the app — there's no session or lock state
that needs an explicit teardown. Do not delete a `publishedDays`,
`evidencePackets`, or `proposedDays` document to "undo" a test day
unless it's confirmed nobody will need that record later; prefer leaving
it in place (a family test day is real school activity, not throwaway
data, unless everyone involved agrees otherwise before deleting
anything).

## 4. Known limitations (carried into this test, not blockers)

- No web test runner exists in this repo — web verification is
  build/typecheck/lint only, never a rendered-DOM test. UI behavior is
  confirmed by the family test itself, not by an automated suite.
- No scheduled trigger exists for two-day-ahead generation — a teacher
  must click "Generate" manually. Acceptable for a small controlled
  test; would need addressing before unattended daily production use.
- Historical Figure artwork is honestly unavailable (no image pipeline
  built yet) — the UI already handles this gracefully, not a bug, just
  a not-yet-built feature explicitly frozen out of this test's scope.
- This sandbox cannot verify live Firebase project state (secrets,
  existing bootstrapped accounts, current deployed code) directly —
  every claim about "the live project" in this document and in step
  11.4's report is inferred from repository history or stated as
  unverifiable, never asserted as directly observed.
