# Course Atlas mobile architecture

The Android app is a single-user client for the public Course Atlas API.

## Runtime boundaries

- `src/core`: immutable timetable types, an empty first-run state, and time calculations.
- `src/services`: network and persistent cache adapters.
- `src/hooks`: screen-facing orchestration for data refresh and background OTA checks.
- `src/components`: reusable interaction and motion primitives.
- `src/app`: Expo Router screens and composition only.

The hosted Site remains the source of truth. `/api/schedule` reads the validated
Sites-managed runtime payload (with R2 as a fallback), while `/api/calendar`
reads the runtime NTULearn calendar snapshot. The APK contains no real
timetable, location, exception, assessment, notice, event title, feed URL, or
credential. After the first successful request, the app renders its
AsyncStorage caches immediately; a failed request does not remove the last
verified data.

Pull-to-refresh and the top-right status control share the same refresh action and update both the timetable snapshot and the NTULearn calendar. `POST /api/calendar/refresh` performs exactly one upstream calendar fetch inside Sites; ordinary app startup only reads the cached Site snapshot. The home screen shows at most three upcoming items and one concise next-break row; the full official semester periods stay in the existing detail sheet.

The backend timetable, academic calendar, and agenda can be changed independently through the
validated, UTF-8 chunked `COURSE_ATLAS_DATA_JSON_1`, `_2`, … Sites secrets.
The same payload may include optional dated `courseBriefs`. They are stored in
the schedule cache and appear only after a course is opened, so weekly homework
or preparation changes are backend-only updates and remain available offline.
`data/schedule.json` is an
ignored local staging file; Git contains only `data/schedule.example.json`.
The protected `/api/admin/schedule` endpoint remains available for the R2
fallback. Updating runtime data does not require an APK or OTA.

## Release policy

- Timetable, Quiz/CA, notice, and calendar content changes: update or refresh the Sites backend; no app release is needed.
- JavaScript, styling, and assets: publish to `staging`, verify on the Redmi K90 Pro Max, then promote the exact commit to `production` with EAS Update.
- Native dependency or permission changes: increment the app version and build a new signed APK/AAB.

The app downloads OTA updates without interrupting the current session. The downloaded update becomes active after a later cold start.

## Performance budget

- Target display: Redmi K90 Pro Max, portrait, 120 Hz.
- Interaction response: under 100 ms.
- Sheet open/close: 210–270 ms, transform and opacity only.
- After first sync, the cached schedule is available before the first network response.
- PDF support must render only visible and adjacent pages when added.
