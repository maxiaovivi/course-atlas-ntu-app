# Course Atlas mobile architecture

The Android app is a single-user client for the public Course Atlas API.

## Runtime boundaries

- `src/core`: immutable timetable types, an empty first-run state, and time calculations.
- `src/services`: network and persistent cache adapters.
- `src/hooks`: screen-facing orchestration for data refresh and background OTA checks.
- `src/components`: reusable interaction and motion primitives.
- `src/app`: Expo Router screens and composition only.

The hosted Site remains the source of truth. `/api/schedule` reads the current timetable from R2, while `/api/calendar` reads the sanitized NTULearn calendar snapshot. The APK contains no real timetable, location, exception, notice, feed URL, or credential. After the first successful request, the app renders its AsyncStorage caches immediately; a failed request does not remove the last verified data.

The single top-right refresh control updates both the timetable snapshot and the NTULearn calendar. `POST /api/calendar/refresh` performs exactly one upstream calendar fetch inside Sites; ordinary app startup only reads the cached Site snapshot. The app shows at most six events from the next 14 days.

The backend timetable can be changed independently with `data/schedule.json` and the protected `/api/admin/schedule` endpoint. The worker validates the schema and sets `updatedAt` server-side. Updating it does not require an APK, OTA, or frontend build.

## Release policy

- Timetable and calendar content changes: update or refresh the Sites backend; no app release is needed.
- JavaScript, styling, and assets: publish to `staging`, verify on the Redmi K90 Pro Max, then promote the exact commit to `production` with EAS Update.
- Native dependency or permission changes: increment the app version and build a new signed APK/AAB.

The app downloads OTA updates without interrupting the current session. The downloaded update becomes active after a later cold start.

## Performance budget

- Target display: Redmi K90 Pro Max, portrait, 120 Hz.
- Interaction response: under 100 ms.
- Sheet open/close: 210–270 ms, transform and opacity only.
- After first sync, the cached schedule is available before the first network response.
- PDF support must render only visible and adjacent pages when added.
