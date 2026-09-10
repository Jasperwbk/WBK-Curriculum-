# WBK Homeschool Ecosystem

Private, family-only homeschool tracker: accounts, permissions, file uploads,
hour/test logging, the pace/banking dashboard, and — now — a first web
frontend for the teacher view (log an activity, see the pace gauges). No
curriculum generation, sibling app integration (Rhoe Field Scout, etc.), the
student's own view, or offline sync yet — those are later phases.

Stack: Firebase Auth + Firestore + Storage, Cloud Functions (TypeScript) for
logic that shouldn't live on the client (dashboard pace/banking calculations,
the extracurricular text-ingestion flow), and a React + Vite web app for the
teacher UI. The web app is deliberately built against nothing but the shared
Firebase backend/auth (no web-only shortcuts) so an Android app can be added
later against the exact same accounts and data, per the long-term "one
account, kept in sync across apps" goal.

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

web/                      React + Vite teacher web app (deployed to Firebase Hosting)
  src/lib/firebase.ts       Client SDK init — needs the real Web SDK config filled in
  src/context/AuthContext.tsx  Signed-in user + their users/{uid} profile/role
  src/pages/                Login, teacher dashboard, log-activity form, student placeholder
  src/components/Gauge.tsx   Pace/banking meter (dataviz-skill status palette)
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

## Web app (teacher view)

`web/` is a React + Vite app covering, for now, the teacher-facing side only:
sign in, pick a student, see their pace gauges (total/core/home-core + a
per-subject breakdown), and log an activity. Students, the extracurricular
ingestion UI, and the sibling subject apps (Rhoe Field Scout, future
apps) are intentionally not wired in yet.

It talks to Firebase the same way any client would: Firebase Auth for
sign-in, direct Firestore reads (governed by `firestore.rules`) for the
family/student list, and the `getDashboardData` callable for the gauges. An
Android app can be built later against the exact same accounts, rules, and
functions — nothing here is web-specific.

### One-time setup: the Web SDK config

`src/lib/firebase.ts` needs your project's client-side config (this is not a
secret — it's fine to commit; security comes from the Firestore/Storage rules
and Cloud Functions auth checks, not from hiding this object). Get it with:

```bash
firebase apps:create WEB "WBK Homeschool Web"   # first time only
firebase apps:sdkconfig WEB
```

Copy the printed `apiKey`, `messagingSenderId`, and `appId` into the
`firebaseConfig` object in `src/lib/firebase.ts` (the other fields are
already filled in for this project).

### Running locally

```bash
cd web
npm install
npm run dev
```

### Deploying to Firebase Hosting

```bash
firebase deploy --only hosting
```

(`firebase.json`'s hosting config runs `npm install`/`npm run build` inside
`web/` automatically before deploying, so a plain `npm run build` isn't a
separate step.)

## Deploying

```bash
npm install -g firebase-tools   # if not already installed
firebase login
# update .firebaserc's "default" project id to your actual Firebase project
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase deploy --only firestore:rules,firestore:indexes,storage:rules,functions,hosting
```

Local development: `cd functions && npm run serve` runs the Auth, Firestore,
Storage, and Functions emulators together (see `firebase.json`).

## What's deliberately deferred

Per spec section 5 — curriculum content generation, app-tagging/context-aware
lesson routing, sibling teamwork logic, and offline download/sync are all
later phases. On the frontend specifically: the student's own view, the
extracurricular ingestion UI (`parseExtracurricular`/`confirmExtracurricular`
have no screen yet — teacher-entered `logs` only, for now), wiring in the
sibling subject apps (Rhoe Field Scout, future apps), and the Android app are
all intentionally not built yet.
