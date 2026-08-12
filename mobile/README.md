# 知屿课表 Android

Single-user Expo client for the NTU Course Atlas Site.

The APK contains UI and cache logic only. Timetable, rooms, temporary changes,
Quiz/CA dates, course notices, and the runtime NTULearn calendar snapshot come
from the Site API, so ordinary data changes do not require an app release. Real
runtime content and the private feed URL are never bundled into GitHub source or
the APK. Pull-to-refresh and the top-right status control update both the
timetable and calendar.

```bash
npm run typecheck
npm run export:android
```

Set `EXPO_PUBLIC_COURSE_ATLAS_URL` only when testing against a non-production Site. See `ARCHITECTURE.md` for data and release boundaries.
