# Bug Report — RealTrack

Audit date: 2026-06-26
Scope: full codebase (pages, components, store, lib, API routes, middleware).

Severity legend:
- **P0 / CRITICAL** — blocks a core flow or destroys data for normal usage; or a security hole that's actively exploitable today.
- **P1 / HIGH** — meaningful misbehavior for plausible input; or a security hole with a clear exploit path.
- **P2 / MEDIUM** — noticeable bug, edge condition, or defensive miss.
- **LOW** — minor / cosmetic-but-real.

Findings already tracked in TODO.md are not duplicated here.

---

## Part 1 — User-side bugs (what the user sees and experiences)

### P1 — annoying / silent data loss

#### U-1. Quiz Lab shows "Quiz saved" toast even when save fails
- **File:** `src/app/quiz-lab/page.tsx:105-108`
- **What the user sees:** After generating a quiz, the green "Quiz saved" toast appears no matter what. If `addQuiz` rejects (offline, RLS error, Supabase down), the quiz never makes it to the database. On refresh it's gone.
- **Repro:**
  1. Quiz Lab → Create New Quiz → fill form → Generate.
  2. Force `addQuiz` to fail (DevTools offline mid-save).
  3. Toast reads "Quiz saved". Refresh → quiz is missing.
- **Root cause:** `.then(() => toast.success("Quiz saved")).catch(() => toast.success("Quiz saved"))` — both branches hard-coded to success. The `.catch` should be `toast.error(...)`.

#### U-2. Flashcards page swallows deck-save failures silently
- **File:** `src/app/flashcards/page.tsx:23-29`
- **What the user sees:** Flashcard generation completes (the form's own "Generated N flashcards" toast fires and the modal closes), but if `addDeck` rejects, the deck never appears in the list and the user gets zero feedback. They believe the deck was saved.
- **Repro:**
  1. Flashcards → Create Flashcard → upload PDF → Generate.
  2. Force `addDeck` to reject (offline, RLS).
  3. Modal closes, success toast already shown, deck never appears in "Your Decks".
- **Root cause:** `handleCreated` calls `addDeck(data)` with no `await`, no `.then`, no `.catch`. Unhandled rejection.

#### U-3. Create-Quiz modal can be dismissed mid-generation
- **File:** `src/components/ui/quiz-form.tsx:271, 277-283`
- **What the user sees:** While the AI generation spinner is visible (often 30+ seconds), clicking outside the modal or the X dismisses it. The user can click "Create New Quiz" again and start a second generation, burning a second batch of credits; both can eventually complete and add two duplicate quizzes.
- **Repro:**
  1. Create New Quiz → fill form → click Generate Quiz.
  2. While the spinner is visible, click outside the modal or the X.
  3. Modal closes; in-flight fetch keeps running. Click Create New Quiz again → second generation in parallel.
- **Root cause:** `onClick={onClose}` on backdrop (line 271) and on the X (lines 277-283) — no `loading` guard. The sibling `flashcard-form.tsx` correctly guards both at lines 319/327.

#### U-4. Search page can't distinguish "no matches" from "network failed"
- **File:** `src/app/search/page.tsx:92-213`
- **What the user sees:** Going offline (or any of the four parallel fetches rejecting) leaves the page showing "0 results" with no error indication. User has no way to know whether the query genuinely matched nothing or whether search is broken.
- **Repro:**
  1. DevTools → Offline.
  2. Navigate to `/search?q=anything`.
  3. Loading clears, page shows "0 results" silently.
- **Root cause:** Outer `try { ... } finally { ... }` has no `catch` around `Promise.all([...])`.

#### U-5. Passing-Target threshold edit writes to wrong course after a sibling delete
- **File:** `src/app/passing-target/page.tsx:1032-1069, 1097-1115`
- **What the user sees:** User opens the Pass-Threshold pencil on course at index 2 and starts typing. While the input is open, they delete a course above it (index 0). The input is still visible but `editingThresholdIndex` still equals 2 — which now references a different course. Clicking ✓ writes the new threshold to the wrong course.
- **Repro:**
  1. Have 3 courses (A, B, C).
  2. Click pencil next to C's Pass Threshold, type 85.
  3. Without closing the input, click trash on A and confirm.
  4. Click ✓ — value lands on the wrong course.

#### U-6. Passing-Target swallows PATCH/DELETE errors
- **File:** `src/app/passing-target/page.tsx:362-381` (PATCH), `1097-1115` (DELETE)
- **What the user sees:** Editing a threshold, weight, score, or deleting a course updates the UI optimistically. If the server returns 4xx/5xx (session expired, validation error), nothing tells the user. On refresh the change is gone or the deleted course reappears.
- **Repro:**
  1. Block `PATCH /api/courses` in DevTools (return 500).
  2. Edit a Pass Threshold → ✓ → UI updates.
  3. Refresh → old value is back, no error was shown.
- **Root cause:** `persistCourse` and the trash-can handler use `try { await fetch(...) } catch {}` with no `resp.ok` check and an empty catch block.

#### U-7. Editing a recurring schedule silently touches only one occurrence
- **File:** `src/app/priority-planner/page.tsx:169-189`
- **What the user sees:** "Math class — every Monday for 12 weeks" added, user edits one Monday's title to "Math midterm". Only that one Monday updates; the other 11 still say "Math class". No prompt offering "edit this one / edit all" and no toast explaining the scope.
- **Repro:**
  1. Add Schedule → repeat weekly for 12 weeks.
  2. Open any single occurrence, change the title, save.
  3. Other weeks unchanged. No "this one only" notice.

### P2 — annoying but not destructive

#### U-8. Dashboard mini-calendar click looks broken — does nothing
- **File:** `src/app/dashboard/page.tsx:189-196, 539, 569-590`
- **What the user sees:** Clicking a day on the mini-calendar visually highlights it. The user expects the event list below to filter to that day. It doesn't — the list is always the global next-5 upcoming events.
- **Repro:**
  1. Open Dashboard.
  2. Click a day on the mini-calendar that has dots.
  3. Cell highlights; event list below is unchanged.
- **Root cause:** `selectedDay` state is set but never read by the `events` memo (line 190).

#### U-9. Sidebar "Finish quiz" bypasses the answer-required guard
- **File:** `src/app/quiz-lab/[quizId]/take/page.tsx:219-225`
- **What the user sees:** The main Next/Finish button is disabled until the current question is answered. The sidebar "Finish quiz" link has no such guard — one misclick submits with whatever subset of answers exists (often none) and records a 0/total attempt.
- **Repro:**
  1. Open any quiz `/take` without answering.
  2. Click "Finish quiz" in the sidebar.
  3. Lands on the Result page with 0/total; a 0-score attempt is recorded in history.

#### U-10. Assessment and Item forms have no submit lock — double-click creates duplicates
- **File:** `src/components/ui/assessment-form.tsx:24-38`, `src/components/ui/item-form.tsx:23-37`
- **What the user sees:** On a slow connection, double-clicking "Add Assessment" / "Add Item" or hitting Enter twice fires `onSubmit` twice before the parent unmounts the modal — two identical entries appear and have to be manually deleted. `CourseForm` already guards with `isSubmitting`; these two don't.
- **Repro:**
  1. DevTools → Slow 3G.
  2. Course → Add Assessment → fill in → click "Add Assessment" twice quickly.
  3. Two identical assessments saved.

#### U-11. Add-Schedule rejects overnight blocks with a misleading error
- **File:** `src/components/ui/add-schedule-form.tsx:253`
- **What the user sees:** Entering an evening block like 22:00–02:00 is rejected with "End time must be after start time." String-compare of HH:MM means there's no way to enter an overnight schedule.
- **Repro:**
  1. Add Schedule → Start 22:00, End 02:00 → submit.
  2. Toast: "End time must be after start time" with no overnight option.

#### U-12. Reset-password page can flash "invalid or expired" on slow networks
- **File:** `src/app/reset-password/page.tsx:44-50`
- **What the user sees:** On slow networks, a 3-second timer fires before `getSession()` resolves or `PASSWORD_RECOVERY` arrives. A user with a valid link sees a red "This reset link is invalid or has expired" error. The form may render under it once auth lands, but the alarming error stays visible.
- **Repro:**
  1. DevTools → Slow 3G.
  2. Click a valid reset link from email.
  3. ~3s in, the red error box appears even though the link is fine.

---

## Part 2 — Edge-case bugs

### P0

#### E-1. AI-scheduled blocks display at the wrong wall-clock hour for non-UTC users
- **File:** `src/app/priority-planner/page.tsx:568-572`
- **What goes wrong:** Server's `expandDailyTemplates` builds Date with `setHours(9, 0)` — server-local hours, which on Vercel is UTC. The block is emitted as `start_time.toISOString()`; the client parses with `new Date(block.start_time)` and reads `start.getHours()` (local). A Jakarta user (UTC+7) with a session window "09:00–17:00 local" sees AI-scheduled blocks at 16:00–24:00 local.
- **Trigger:** Any user in a non-UTC timezone runs "Plan with AI". The deeper data flow also affects `parseDeadlineDays` rounding via DST — but the wall-clock shift is the immediately visible bug.
- **Severity:** P0 — every non-UTC user sees recommended work blocks at the wrong hour.

### P1

#### E-2. `addTask` non-OK server response creates a ghost task that vanishes on refresh
- **File:** `src/store/use-store.ts:437-452`
- **What goes wrong:** When `fetch('/api/tasks', POST)` succeeds at the network layer but returns a non-2xx (session expired → 401, schema-cache 500, validation 400), control falls past the `if (resp.ok)` block to the local-only `set(...)`. UI shows the task; the next `fetchInitial()` removes it because the server never stored it.
- **Trigger:**
  1. User session expires while page is open.
  2. User adds a task → it appears in UI.
  3. Refresh → task is gone, no error was shown.

#### E-3. `addQuiz` has the same ghost-quiz pattern, plus duplicate risk on timeout
- **File:** `src/store/use-store.ts:360-390`
- **What goes wrong:** On non-OK response, the code inserts a quiz with a client-generated `uid("quiz")` id; `body` is never read so no server id is captured. On `fetchInitial()` the server returns nothing for that id; the "never overwrite local with empty" guard at use-store.ts:540-545 keeps the ghost forever. If the server actually saved it (client timeout but server completed), the user ends up with two quizzes — one ghost, one real.

#### E-4. Monthly recurring schedule starting on day 31 collapses to "3rd of every month"
- **File:** `src/app/priority-planner/page.tsx:218-229`
- **What goes wrong:** `setMonth(getMonth() + 1)` overflows Jan 31 → Mar 3 (skipping Feb). The cursor is now at the 3rd, so all subsequent occurrences are Apr 3, May 3, Jun 3, ... The comment "fine for a study planner" doesn't hold — only the first occurrence lands on the intended day-of-month.
- **Trigger:**
  1. Add monthly recurring schedule starting Jan 31, repeat until Dec 31.
  2. Inspect occurrences: Jan 31, Mar 3, Apr 3, May 3, ...

#### E-5. `parseFloat("0h") || 2` silently changes 0-hour tasks to 2-hour during scheduling
- **File:** `src/app/task-value/page.tsx:349`, `src/app/priority-planner/page.tsx:468` (and the new stopwatch editor)
- **What goes wrong:** `Number.parseFloat(task.timeEstimate) || 2` uses falsy coercion: `parseFloat("0h") = 0`, `0 || 2 = 2`. A task the user explicitly set to "0h" (now possible after the stopwatch editor) gets two hours of work allocated in the AI schedule.
- **Trigger:**
  1. Add a task with stopwatch hours = 0:00 and minutes = 0:00 (or edit an existing task to 0).
  2. Run Plan with AI.
  3. Schedule allocates 2h of work for what the user said is 0h.
- **Fix:** `Number.parseFloat(...) ?? 2` or `Number.isFinite(n) ? n : 2`.

#### E-6. `recordAttempt` deletes the prior attempt history for that quiz on every retake
- **File:** `src/store/use-store.ts:399-420`
- **What goes wrong:** `state.attempts.filter(a => a.quizId !== attempt.quizId)` removes every previous attempt of the same quiz before prepending. A user who takes a quiz three times only ever sees the most recent attempt — no progress history.
- **Trigger:** Take any quiz twice. The first attempt's score is gone from the dashboard / study-companion review list.

#### E-7. Deleting all tasks on device A never reaches device B
- **File:** `src/store/use-store.ts:540-545`
- **What goes wrong:** `if (Array.isArray(tasks) && (tasks.length > 0 || cur.tasks.length === 0)) next.tasks = tasks` — i.e., "only replace local tasks if server returned ≥1 task OR local is empty." Server returning `[]` while local has rows means device B keeps the stale rows forever. Editing/deleting them then 500s server-side, and the ghost-task rule (E-2) keeps them locally.
- **Trigger:**
  1. Three tasks. Open on phone & laptop.
  2. Delete all three on phone.
  3. Refresh laptop → tasks still visible; each is a zombie that can't be edited or deleted.

  Same bug applies to decks, quizzes, courses (same code path).

### P2

#### E-8. `parseTaskDate("Feb 29")` silently shifts to Mar 1 in non-leap years
- **File:** `src/lib/task-date.ts:21-43`
- **Trigger:** Legacy display string "Feb 29" loaded from persisted localStorage in a non-leap year → `new Date("Feb 29 2026") = Mar 1 2026`. Deadline silently shifts.

#### E-9. Float-accumulator drift on weight/credit caps in Passing-Target
- **File:** `src/app/passing-target/page.tsx:594-712`
- **Trigger:** Three weights of 33.33 / 33.33 / 33.34 (sum displays as 100). Float-accumulator drifts to 100.000…1; adding a 4th 0.5-weight item alerts "would be 100.5%". `computeThreshold`'s 0.5 tolerance masks the drift but blocks legitimate adds.

#### E-10. `computeThreshold` divides by zero when all under-leaves have weight 0
- **File:** `src/app/passing-target/page.tsx:248-279`
- **Trigger:** Assessment with weight 100 / score 50 / passing 75, then inline-edit weight to 0 → `underWeight = 0` → `target = Infinity` → `Math.round(Infinity*10)/10 = NaN`. Recovery banner shows misleading message instead of "weights are zero".

#### E-11. Day-arrow clicks drift across DST in non-UTC timezones
- **File:** `src/app/priority-planner/page.tsx:686-708`
- **Trigger:** US user on Mar 9 clicks "Next Day" repeatedly across the DST forward jump. `new Date(year, month, selectedDay)` accumulates a 1-hour offset and `selectedDay` updated via `getDate()` rolls into the next month silently.

#### E-12. Long quizzes can blow the URL length on submit
- **File:** `src/app/quiz-lab/[quizId]/take/page.tsx:97-100`
- **Trigger:** 50+ question imported quiz with long question IDs. `router.push(.../result?a=${encodeURIComponent(JSON.stringify(answers))})` exceeds browser URL caps; the result page reads `a=null`, scores everything wrong, and persists `correct=0`, overwriting prior good attempts (compounds with E-6).

#### E-13. "Reassessment:" matches as if it were "Assessment:"
- **File:** `src/lib/task-date.ts:64-73`
- **Trigger:** Task description "Reassessment of midterm: see notes" → `extractAssessmentName` returns "of midterm" because the regex isn't word-bounded. Label in Priority Planner shows wrong text.

#### E-14. Image-mode sentinel JSON has no shape validation
- **File:** `src/store/use-store.ts:563-583`
- **Trigger:** A flashcard deck row with `cards: [{ front: "__image_mode__", back: "<malformed JSON>" }]`. Downstream OCR renderer reads `regions[i].bbox[0]` and crashes the flashcards page. Related to the security beacon issue S-6.

#### E-15. TOPSIS produces NaN scores when two tasks have identical criterion vectors
- **File:** `src/lib/python-ports/priority-analysis.ts:300-336`
- **Trigger:** Two tasks with identical inputs (grade_weight, sks, deadline_days). Column variance = 0 → `closeness = 0/0 = NaN`. Sort by NaN is undefined; persisted priority bucket falls to LOW.

#### E-16. `recordAttempt` accepts impossible `correct > total` values
- **File:** `src/store/use-store.ts:399-420`
- **Trigger:** localStorage tampering or a future migration leaves `correct=5, total=3`. Dashboard renders "166% mastered".

---

## Part 3 — Security / vulnerability

### HIGH

#### S-1. `/api/ai/metrics` is unauthenticated and exposes internal counters globally
- **File:** `src/app/api/ai/metrics/route.ts:7`
- **Impact:** Anyone on the internet can GET this endpoint and read every counter in the in-process `counters` Map: total Claude/OpenRouter call volume, rate-limit triggers, model usage, error counts. Lets an attacker time abuse (spam when error rates are high so failures blend in) and fingerprint deploys.
- **Repro:** `curl https://<host>/api/ai/metrics` → returns `{"ok":true,"metrics":{...}}`.
- **Fix:** Gate with `requireUserId()` or a `METRICS_TOKEN` secret.

#### S-2. Profile PATCH accepts an unconstrained `avatar_url`
- **File:** `src/app/api/profile/route.ts:50-83`
- **Impact:** `body.avatar_url` is written straight to the row and later rendered by `<Image>` across search, tutors, sessions, connections. An attacker can set it to a `data:` URL of arbitrary size (storage abuse), or to a URL the Next.js image optimizer fetches server-side — opening SSRF to internal addresses (e.g., `http://169.254.169.254/...`) if `images.remotePatterns` is permissive. `full_name` is also uncapped (UI DoS).
- **Repro:**
  ```bash
  curl -X PATCH -H 'Cookie: sb-...' -H 'Content-Type: application/json' \
       -d '{"avatar_url":"http://169.254.169.254/latest/meta-data/iam"}' \
       https://<host>/api/profile
  ```
- **Fix:** Whitelist `avatar_url` host (Google avatars, Supabase storage). Cap `full_name` to ~80 chars.

#### S-3. PostgREST filter injection via `target_id` in social routes
- **File:** `src/app/api/social/connections/route.ts:62-63, 120`; `src/lib/social.ts:8, 28-30`
- **Impact:** `target_id` is interpolated into `.or(\`and(requester_id.eq.${userId},addressee_id.eq.${target_id}),and(...)\`)`. Commas/parens/dots are filter syntax in PostgREST; with the service-role admin client (bypasses RLS), a crafted `target_id` could coerce the "existing connection?" SELECT to return a row where `addressee_id === userId`, hitting the auto-accept branch and minting a mutual relationship without consent — which unlocks `/api/social/materials` sharing to that user.
- **Fix:** Reject any `target_id` that isn't `/^[0-9a-f-]{36}$/i` before the DB call; use parameterized RPC.

#### S-4. Flashcard / quiz POST trust `cards` / `questions` verbatim → cross-user beacon via shared decks
- **File:** `src/app/api/flashcards/route.ts:33-53`, `src/app/api/quizzes/route.ts:33-72`
- **Impact:** The image-mode sentinel card encodes `imageDataUrl` in `back`. The route doesn't validate this is a `data:` URI — an attacker can plant an `http(s)://evil.com/beacon.png?u=...` URL, then share the deck through `/api/social/materials` → `/api/social/materials/save` clones it into the victim's library. Opening the deck fires the attacker's URL with the victim's IP and any same-origin context.
- **Repro:**
  1. `POST /api/flashcards` with `cards:[{ front:"__image_mode__", back:"{\"imageDataUrl\":\"https://evil.com/beacon.png\",\"width\":1,\"height\":1,\"regions\":[]}" }]`.
  2. Share to a mutual via `POST /api/social/materials`.
  3. Victim opens → beacon fires.
- **Fix:** Validate `imageDataUrl` is `^data:image/`. Cap `cards.length` and per-field string lengths. Reject the `__image_mode__` sentinel except via the OCR endpoint.

#### S-5. Mass-assignment + unconstrained payload size in `POST /api/courses`
- **File:** `src/app/api/courses/route.ts:68-118`
- **Impact:** Takes `assessments`, `scheduleEntries`, `credits`, `threshold`, `requirements`, `title`, `description`, `typeTracking`, `passingRequirement` from the body with no shape/type validation. An attacker can stuff arbitrary giant JSON into `course_payload`, slowing reads or crashing downstream consumers (Passing Target, Dropout Risk, Priority Planner). User-scoped today, but no validation layer.
- **Fix:** Allowlist fields and validate shape with zod / typebox.

### MEDIUM

#### S-6. CORS `Access-Control-Allow-Origin: *` on 8 Python/AI routes
- **Files:**
  - `src/app/api/python/dropout_risk/route.ts:184`
  - `src/app/api/python/graduation_threshold/route.ts:175`
  - `src/app/api/python/priority_analysis/route.ts:61`
  - `src/app/api/python/sacrifice_intel/route.ts:168`
  - `src/app/api/python/scheduling/route.ts:784`
  - `src/app/api/study-matching/route.ts:143`
  - `src/app/api/ai/study-companion/route.ts:171`
  - `src/app/api/ai/flashcards/ocr-image/route.ts:112`
- **Impact:** OPTIONS handlers return `Allow-Origin: *`. Today `requireUserId()` blocks anonymous use so the worst impact is reflected errors. The `*` is a latent footgun: if any of these endpoints ever start returning user-scoped DB data, an arbitrary site becomes a cross-tenant leak via the user's browser. The wildcard *not* paired with `Allow-Credentials: true` is currently a defensive shortfall, not exploitable.
- **Fix:** Echo only the app's origin (or omit the CORS headers entirely so the same-origin default applies).

#### S-7. `/api/billing/checkout` builds the finish-redirect URL from a browser-controlled `Origin` header
- **File:** `src/app/api/billing/checkout/route.ts:32-50`
- **Impact:** A victim's checkout `finishRedirectUrl` can be set to `https://evil.com/study-companion?purchase=success` by sending `Origin: https://evil.com`. Payments themselves are safe (credit grant keyed by server-derived userId), but a phishing site can mimic the success screen.
- **Fix:** Pin to `process.env.OPENROUTER_APP_URL` (or whitelist).

#### S-8. `/api/social/sessions` accepts arbitrary `meet_url` and any user can self-promote to tutor
- **File:** `src/app/api/social/sessions/route.ts:62-104`; `src/app/api/social/tutors/route.ts:56`
- **Impact:** `meet_url` validated only by `/^https?:\/\/.+/i`. Combined with no verification of `is_tutor` flips, any account can host a global session pointing to `https://evil.com/phish-login`. Open-redirect / phishing pivot inside the platform.
- **Fix:** Whitelist `meet_url` host (meet.google.com, zoom.us, teams.microsoft.com, …). Gate `is_tutor` with manual review.

#### S-9. `/api/social/materials` accepts arbitrary MIME on the storage-direct branch
- **File:** `src/app/api/social/materials/route.ts:103-110`; `src/app/api/uploads/sign/route.ts`
- **Impact:** Signed-upload endpoint doesn't validate file type or size beyond 50MB. Materials route only checks the path is under `/<userId>/`. An attacker can PUT HTML/JS with `Content-Type: text/html`, register it as a "material" with a PDF-shaped title, and share it; recipients clicking load attacker HTML from the project's Supabase storage CDN.
- **Fix:** Verify the uploaded object's actual `Content-Type` via `storage.from(bucket).list(...)` before registering; reject non-PDF.

#### S-10. `flashcard_decks` / `quizzes` POST has no count or size limits
- **Files:** `src/app/api/flashcards/route.ts:33-53`, `src/app/api/quizzes/route.ts:33-72`
- **Impact:** Any authenticated user can POST `cards: [...1e6 entries...]` or multi-MB `questions`. No rate limit, no per-row cap. Storage/bandwidth abuse and DoS on Vercel function timeouts. Compounds with S-4.
- **Fix:** Cap `cards.length ≤ 500`, `questions.length ≤ 200`, and enforce a JSON byte budget.

### LOW

#### S-11. Disposable-email blocklist is exact-domain only
- **File:** `src/app/api/auth/signup/route.ts:10-44`
- **Impact:** `sub.mailticking.com` and Unicode lookalikes (`mailticking.cοm` with a Greek omicron) bypass the blocklist. Anti-spam concern only.

#### S-12. AI study-companion intent router is not rate-limited
- **File:** `src/app/api/ai/study-companion/route.ts:136-158`
- **Impact:** Authenticated endpoint with no burst limit. Cheap keyword matching, but lets an attacker inflate metrics / probe input semantics.

---

## Verified clean (audited and OK)

- `middleware.ts` intentionally excludes `/api/*` from the redirect gate so JSON XHRs don't 307; the API routes enforce auth via `requireUserId()` / `getUserId()` themselves. Every reviewed route is covered except `/api/ai/metrics` (S-1). `auth/signup` is intentionally public; `billing/webhook` is signature-verified.
- Service-role key only used in `@/lib/supabase/admin` server-side. No client component imports it.
- `/auth/callback` redirect uses `new URL(next, url.origin)` — same-origin only. Sign-in wraps `?next=` with `safeNext()` (no protocol-relative URLs). No open-redirect on auth.
- `/api/items` and `/api/assessments` verify ownership of the referenced `assessment_id` / `course_id` parent.
- Billing webhook re-derives credit count from the canonical server-side pack and cross-checks `gross_amount` — no client-controlled credit grants.
- `ownsStoragePath()` (`src/lib/storage-uploads.ts:24-36`) prevents path traversal; sign endpoint embeds `userId` into a server-generated path and sanitises filenames.
- No `dangerouslySetInnerHTML`, `eval(`, or `new Function(` in `src/**`.
- Zustand persist (`realtrack-storage`) holds only app state (decks, tasks, settings) — no auth tokens. `auth-sync.tsx` clears it on user change.

---

## Summary table

| # | Severity | File:Line | Headline |
|---|----------|-----------|----------|
| E-1 | P0 | priority-planner/page.tsx:568 | AI-scheduled blocks at wrong wall-clock hour for non-UTC users |
| S-1 | HIGH | api/ai/metrics/route.ts:7 | Unauthenticated metrics endpoint |
| S-2 | HIGH | api/profile/route.ts:50 | Unconstrained `avatar_url` enables SSRF via image optimizer |
| S-3 | HIGH | api/social/connections/route.ts:62 | PostgREST filter injection via `target_id` |
| S-4 | HIGH | api/flashcards/route.ts:33 | Image-mode sentinel allows cross-user beacon via shared decks |
| S-5 | HIGH | api/courses/route.ts:68 | Mass-assignment + uncapped payload |
| U-1 | P1 | quiz-lab/page.tsx:105 | "Quiz saved" toast on failure |
| U-2 | P1 | flashcards/page.tsx:23 | Deck save failure shows no error |
| U-3 | P1 | components/ui/quiz-form.tsx:271 | Quiz modal closes mid-generation |
| U-4 | P1 | search/page.tsx:92 | Search shows "0 results" on network failure |
| U-5 | P1 | passing-target/page.tsx:1032 | Threshold edit writes to wrong course after sibling delete |
| U-6 | P1 | passing-target/page.tsx:362 | PATCH/DELETE errors swallowed |
| U-7 | P1 | priority-planner/page.tsx:169 | Recurring schedule edit touches only one occurrence |
| E-2 | P1 | use-store.ts:437 | Ghost task on non-OK server response |
| E-3 | P1 | use-store.ts:360 | Ghost / duplicate quiz on timeout |
| E-4 | P1 | priority-planner/page.tsx:218 | Monthly recurring on 31st collapses to "3rd of every month" |
| E-5 | P1 | task-value/page.tsx:349 | `parseFloat("0h") \|\| 2` rewrites 0h tasks to 2h |
| E-6 | P1 | use-store.ts:399 | Retake deletes prior attempt history |
| E-7 | P1 | use-store.ts:540 | Cross-device deletion never propagates |
| S-6 | MED | (8 files) | `Access-Control-Allow-Origin: *` on Python/AI routes |
| S-7 | MED | api/billing/checkout/route.ts:32 | Browser-controlled `Origin` in finish redirect |
| S-8 | MED | api/social/sessions/route.ts:62 | Unrestricted `meet_url` + self-promote to tutor |
| S-9 | MED | api/social/materials/route.ts:103 | Storage-direct branch accepts non-PDF MIME |
| S-10 | MED | api/flashcards/route.ts:33 | No card/question count or size cap |
| U-8 | P2 | dashboard/page.tsx:189 | Mini-calendar click does nothing |
| U-9 | P2 | quiz-lab/[id]/take/page.tsx:219 | Sidebar "Finish quiz" bypasses guard |
| U-10 | P2 | assessment-form.tsx:24, item-form.tsx:23 | Double-click creates duplicate rows |
| U-11 | P2 | add-schedule-form.tsx:253 | Overnight time blocks rejected |
| U-12 | P2 | reset-password/page.tsx:44 | Flashes "invalid" on slow networks |
| E-8 | P2 | task-date.ts:21 | "Feb 29" shifts to Mar 1 in non-leap years |
| E-9 | P2 | passing-target/page.tsx:594 | Float-accumulator drift blocks legit adds |
| E-10 | P2 | passing-target/page.tsx:248 | Div-by-zero when all weights = 0 |
| E-11 | P2 | priority-planner/page.tsx:686 | Day-arrow drift across DST |
| E-12 | P2 | quiz-lab/[id]/take/page.tsx:97 | Long quizzes overflow URL on submit |
| E-13 | P2 | task-date.ts:64 | "Reassessment:" matches as if "Assessment:" |
| E-14 | P2 | use-store.ts:563 | Image-mode JSON has no shape validation |
| E-15 | P2 | python-ports/priority-analysis.ts:300 | TOPSIS NaN on identical vectors |
| E-16 | P2 | use-store.ts:399 | No range validation on `correct ≤ total` |
| S-11 | LOW | api/auth/signup/route.ts:10 | Disposable-email blocklist bypassable |
| S-12 | LOW | api/ai/study-companion/route.ts:136 | Intent router not rate-limited |
