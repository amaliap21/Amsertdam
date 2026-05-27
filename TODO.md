- [x] Estimated Hours in Add New Task become editable like setting time in a stopwatch
- [x] Header give white background and not transparent
- [x] When exporting to pdf or excel in Priority Planner, class should not have urgency and task should have the right urgency based on task value
- [x] Gantt chart disappear after refreshes
- [x] Sidebar should always follow, currently its affected by scrolling
- [x] Export modal silently filters out past events when only an end date is picked.
- [x] `/api/ai/study-companion/chat` is unauthenticated.
- [x] Take-quiz page crashes when a quiz has zero questions.
- [x] Flashcard review crashes for text-mode decks whose cards array is empty.
- [x] Priority Planner Week/Day/Month filter is off-by-one in non-UTC timezones.
- [x] Priority Planner Week filter starts on Sunday but the calendar grid starts on Monday.
- [x] `POST /api/items` lets a user attach an item to another user's assessment.
- [x] Edit-task drops effort/priority info but PATCH is OK; however the previous-advice carry-forward is line-fragile.
- [x] Quiz Preview "Download" button is a fake.
- [x] 6 unauthenticated API routes.
- [x] `POST /api/assessments` missing `course_id` ownership check.
- [x] `addTask` ghost task on non-ok server response.
- [x] Dashboard calendar dot colors out of sync with Priority Planner.

## Bug audit findings
- [x] **Right now, analysis results are cached by content (subject | tier | correctAnswer | userAnswer), shared across all users, to avoid paying for the same Opus call twice.** Consequence:
  - If student A (premium) analyzes a question and answer, the result is cached.
  - If student B later requests a premium analysis of the identical question + identical answer + identical correct answer, the route returns the cache hit before spending — so B gets a
  premium-quality result without spending a credit.

  For multiple-choice quizzes this can happen (two students pick the same letter on the same question). It's not "using A's credits" — A's balance is untouched — but A effectively paid to
  generate a result B reused for free.
- []