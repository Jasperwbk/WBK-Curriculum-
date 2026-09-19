# Live Account Smoke-Test Plan

Status: **prepared, NOT executed.** This is a checklist for the eventual
controlled deployment/bootstrap of the five real family accounts against
the live Firebase project. Nothing in this document has been run against
live Firebase — no live credentials exist in the build sandbox, and this
plan is deliberately written to be run later, by someone with real project
access, once a deployment is explicitly approved.

Do not use this plan as a substitute for the unit/emulator test suites —
it verifies the deployed, bootstrapped system as a whole, from the outside,
the way a real family member's sign-in would actually behave. It assumes
`npm run seed` (or equivalent) has already been run against the live
project with the real, gitignored `scripts/accounts.config.json`.

## Non-destructive-first rule

Run every read-only check for all five accounts before touching anything
mutating. Do not reset a real password or change a real email merely to
prove the Account Administration feature works — that requires Cory's
explicit, separate approval as its own step, called out at the end of this
plan. Everything above that line only reads data (signs in, reads a
profile, reads a role) and changes nothing.

## Part A — per-account baseline (run for all five people)

For each of Cory, Sarah, Millaray, Makaio, and Maizley, signed in with
their own real credentials on their own device:

1. **Authenticate successfully.** Sign-in succeeds with no error, using
   the credential that was actually provisioned for them (not a shared or
   guessed one).
2. **Resolves to the expected uid/profile.** The signed-in uid's
   `users/{uid}` document exists and its `displayName` matches the real
   person, not a placeholder or another family member's profile.
3. **Resolves to the same intended `familyId`.** All five accounts' profile
   documents carry the identical `familyId` value — confirm this by
   reading all five `users/{uid}.familyId` values side by side (e.g. via
   the Account Administration roster for the four non-owner accounts, plus
   Cory's own profile), not by assuming it.
4. **Resolves to the expected `role`.** Cory and Sarah read `role:
   "teacher"`; Millaray, Makaio, and Maizley read `role: "student"`.
5. **Resolves to the expected `presentationIdentityId`.** See the
   per-person table in Part B — confirm each value against the stable
   identity registry (`presentationIdentity.ts`), not against the
   person's own display name string.
6. **Reaches the correct student/teacher experience.** A teacher account
   lands on the teacher dashboard/day-review flow; a student account lands
   on `StudentHomePage` and — once a day is published for them — the new
   Student Today section (Pledge cue, Jasper Morning Message, agenda,
   LearningBlocks, PE reminder, Historical Figure closing). No account
   should ever land on the other role's screen.

## Part B — per-person specifics

| Person | Role | systemRole | Presentation identity | kidKey | Account Administration | Notes |
|---|---|---|---|---|---|---|
| Cory | teacher | **owner** | jasper | — | **can** access `/account-admin` | Also retains every ordinary teacher capability Sarah has — owner is additive, never a replacement role |
| Sarah | teacher | standard (field absent) | celeste | — | **cannot** access `/account-admin` | Retains all ordinary educational teacher operations: certify, generate, review/approve days, closeout, curriculum quality queue, help-request response — none of this is gated by systemRole |
| Millaray | student | standard (field absent) | kira | millaray | **cannot** access any teacher or account-admin surface | |
| Makaio | student | standard (field absent) | ro | makaio | **cannot** access any teacher or account-admin surface | |
| Maizley | student | standard (field absent) | nova | maizley | **cannot** access any teacher or account-admin surface | |

Confirm each row explicitly rather than assuming it from context:

- **Cory**: after sign-in, the "Account Administration" nav item is
  visible and `/account-admin` loads the family roster (5 people, correct
  display names/roles/presentation identities, plus live Auth metadata —
  email, emailVerified, disabled, creation/last-sign-in time — for each).
- **Sarah**: after sign-in, no "Account Administration" nav item appears,
  and navigating directly to `/account-admin` does not show the roster
  (client-side gate); separately confirm the server-side gate holds — see
  Part D below. Confirm Sarah can still certify a quarter/week, generate
  and approve a two-day-ahead proposal, open/edit/approve an end-of-day
  packet, and respond to a help request, all exactly as before this
  addendum.
- **Millaray / Makaio / Maizley**: after sign-in, confirm there is no
  route, nav item, or visible control anywhere in the student experience
  that reaches a teacher-only or account-admin-only page, and confirm each
  student's own `StudentTodaySection` shows their own published day using
  their own `presentationIdentityId`/`kidKey` (Kira's day is never shown
  under Makaio's sign-in, etc.).

## Part C — owner administration (non-destructive checks only)

Run these only after Part A/B pass for all five accounts, and only the
non-destructive half unless Cory has separately, explicitly approved a
real credential change:

1. Signed in as Cory, load `/account-admin` and confirm the roster shows
   all 5 people with plausible live Auth metadata (non-empty email,
   correct emailVerified/disabled flags, a real creation timestamp).
2. Signed in as Sarah (or any non-owner), directly call
   `getFamilyAccountAdministration`/`resetFamilyMemberPassword`/
   `changeFamilyMemberEmail` (e.g. from browser devtools) and confirm each
   is rejected with `permission-denied` — this is the server-side
   enforcement check, independent of whether the UI hides the nav item.
3. **Do not run** a real `resetFamilyMemberPassword` or
   `changeFamilyMemberEmail` against any of the five real accounts as part
   of this baseline smoke test. That is a separate, explicitly-approved
   test Cory opts into on his own account first (never a student's or
   Sarah's, without asking them), with a plan for how he'll regain access
   if something goes wrong (e.g. testing the password reset on his own
   account, immediately signing in with the new password to confirm it
   before considering the check complete).

## Part D — what "fails" looks like

Any of the following is a stop-and-report condition, not a "note it and
continue":

- Two accounts resolve to different `familyId` values.
- A student account's `role` reads `"teacher"` or vice versa.
- Sarah's profile reads `systemRole: "owner"`, or any student's does.
- A student can reach `/account-admin` or any teacher-only route/control.
- Sarah can reach `/account-admin` via the client OR the server-side
  callables succeed for her.
- Any account's `presentationIdentityId` doesn't match the table in Part
  B, or a student's Student Today content shows another sibling's day.

## Explicitly out of scope for this plan

Account deletion, owner transfer, changing anyone's `systemRole` (no code
path exists to do this outside the seed script — nothing to smoke-test),
Carousel Factoids, and any Firebase Auth flow this addendum didn't build
(password reset via email link, MFA, etc.).
