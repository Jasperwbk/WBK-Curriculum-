# WBK Homeschool Ecosystem — Phase 1 (Backend Foundation)

Firebase backend for a private, family-only homeschool tracker: accounts,
permissions, file uploads, hour/test logging, and the data model behind the
teacher dashboard. No curriculum generation, app integration, or offline
sync — those are later phases.

Stack: Firebase Auth + Firestore + Storage, with Cloud Functions (TypeScript)
for the logic that shouldn't live on the client: dashboard pace/banking
calculations and the extracurricular text-ingestion flow.

## Layout

```
firestore.rules          Firestore security rules
firestore.indexes.json   Composite indexes the dashboard queries need
storage.rules             Storage security rules (uploads/, extracurriculars/, tests/)
firebase.json / .firebaserc

curriculum/                Q1 (Fall) curriculum source files (real content, not
                             generated) — the source of truth for per-subject
                             dashboard weighting; see functions/src/curriculum/

functions/                Cloud Functions (deployed)
  src/types.ts             Firestore schema as TypeScript types
  src/subjects.ts           Standardized subject lists + core/specialty lookup
  src/curriculum/           Weekly per-subject hours (transcribed from curriculum/)
                             + the weight-derivation function dashboard.ts uses
  src/dashboard.ts           Pace/banking calculation logic + getDashboardData callable
  src/extracurriculars.ts    parseExtracurricular / confirmExtracurricular callables
  src/util/auth.ts            Role/family guard helpers shared by every callable

scripts/                  One-off admin scripts (run locally, not deployed)
  src/seedAccounts.ts       Creates the 5 manually-provisioned accounts
  accounts.config.example.json   Template — copy to accounts.config.json (gitignored)
```

## Data model

See `functions/src/types.ts` for the authoritative types. Collections:

- `families/{familyId}` — school-year config (start date, year length,
  total/core/home-core hour targets) and member list.
- `users/{userId}` — `role: "teacher" | "student"`, family link, per-subject
  assessment baseline.
- `logs/{logId}` — every activity: subject, duration, `location` (`home` |
  `field` | `external`), `subjectType` (`core` | `specialty`), and `source`
  (`curriculum` | `extracurricular`).
- `extracurriculars/{recordId}` — tutoring/classes/sports/awards, ingested
  from a dropped-in text file via Claude, teacher-reviewed before saving.
- `tests/{testId}` — graded tests only, with an optional handwritten-test
  image.
- `uploads/{uploadId}` — teacher's document library.

Standardized subjects (`functions/src/subjects.ts`):
- Core: `reading_language_arts`, `math`, `science`, `social_studies_history`
- Specialty: `bushcraft_outdoor_skills`, `homestead_skills`,
  `nature_identification`, `spiritual_cultural`

## Security model

- Firestore rules (`firestore.rules`) enforce: a signed-in user can read
  their own `users/` doc or, if they're a teacher, any doc in their family;
  students can create their own `logs`/`tests` entries but not edit or
  delete them (only a teacher can); `uploads/` and `extracurriculars/` are
  teacher-write, family-read. Every write rule also checks the record's
  `familyId` matches the caller's own family, so one family's data can never
  leak into another's queries even if a client sent the wrong ID.
- Storage rules (`storage.rules`) mirror this: `uploads/{familyId}/...` and
  `extracurriculars/{familyId}/...` are teacher-only; `tests/{familyId}/{userId}/...`
  allows the owning student or a teacher to upload a scanned test image.
- The extracurricular ingestion flow and dashboard reads go through Cloud
  Functions callables (not direct client writes), so the "teacher-only"
  checks there are enforced in `functions/src/util/auth.ts` rather than
  purely in rules.

## Auth flow

Private/family-only — no public signup screen. Five accounts (2 teacher,
3 student) are created once via `scripts/seedAccounts.ts`, not through a
sign-up form. On login, the client reads the user's `users/{uid}.role` and
routes to the teacher dashboard or the student home screen; the security
rules are the enforcement backstop if the UI ever gets that wrong.

### Seeding accounts

```bash
cd scripts
cp accounts.config.example.json accounts.config.json
# edit accounts.config.json: real emails, strong temp passwords,
# school year start date, hour targets
npm install
GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json npm run seed
```

The script is idempotent — matches existing auth users by email and merges
(doesn't overwrite) existing Firestore docs, so it's safe to re-run after
editing the config (e.g. to add a 6th account later).

## Dashboard pace/banking logic

`functions/src/dashboard.ts` implements the spec's pseudocode directly:

- `getExpectedHoursToDate(schoolYear, today, targetHours)` — straight-line
  pace against a target, clamped to the school year's bounds.
- `getBalance(actual, expected)` — positive = banked surplus, negative =
  behind pace.
- `getStatus(balance, expected)` — green / yellow (within 10% behind) / red,
  with the divide-by-zero guard for the very start of the year.

The `getDashboardData` callable runs this once each for total hours, core
hours, home-core hours, and every individual subject, for one student.

**Per-subject targets are curriculum-weighted, not an even split.** The
spec's `families/{familyId}` schema only defines targets for the *total*,
*core*, and *home-core* buckets — not per-subject targets — but section 4
asks for a pace gauge on every individual subject too. `functions/src/
curriculum/weeklyHours.ts` transcribes the actual weekly "Hrs" column from
the Q1 curriculum files in `curriculum/q1_fall/` (identical for Millaray
and Makaio: reading/language arts runs 5 hrs/week vs. 4 for math/science/
social studies, and the specialty subjects run 3/3/3/2). `computeSubject
Weights()` in `functions/src/curriculum/subjectWeights.ts` sums those
hours across every recorded week and turns them into each subject's share
of its bucket's total curriculum hours; `computeDashboardData` multiplies
that share by the bucket's annual target (`coreHoursTarget` for core
subjects, `totalHoursTarget - coreHoursTarget` for specialty subjects) to
get each subject's annual pace target. Maizley (the toddler) has no hour
data in her Q1 file and no legal hour requirement, so she isn't part of
this weighting. As later quarters' curriculum files are written, add their
weekly hours to `weeklyHours.ts` and the derived weights update
automatically.

## Extracurricular ingestion flow

Two callables implement the human-in-the-loop flow from the spec:

1. **`parseExtracurricular({ rawText })`** (teacher-only) — sends the
   dropped-in text to Claude, asks for the structured fields (`type`,
   `title`, `date`, `subjectTag`, `durationMinutes`, `notes`) as JSON, and
   returns them **without writing anything** — the teacher reviews/edits in
   the UI first.
2. **`confirmExtracurricular({ ...fields, sourceFileUrl })`** (teacher-only)
   — writes the reviewed record to `extracurriculars/{recordId}`. Unless
   `type === "award"` (which never has an hours value), it also
   auto-creates a matching `logs/{logId}` entry with `location: "external"`
   and `source: "extracurricular"`, linked back via `extracurricularId`, so
   the hours show up on the dashboard without double entry.

Requires an `ANTHROPIC_API_KEY` secret (Firebase Functions v2 secret param —
set with `firebase functions:secrets:set ANTHROPIC_API_KEY`).

## Deploying

```bash
npm install -g firebase-tools   # if not already installed
firebase login
# update .firebaserc's "default" project id to your actual Firebase project
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase deploy --only firestore:rules,firestore:indexes,storage:rules,functions
```

Local development: `cd functions && npm run serve` runs the Auth, Firestore,
Storage, and Functions emulators together (see `firebase.json`).

## What's deliberately deferred

Per spec section 5 — curriculum content generation, portal UI polish beyond
the dashboard, app-tagging/context-aware lesson routing, sibling teamwork
logic, and offline download/sync are all later phases, not part of this
backend foundation.
