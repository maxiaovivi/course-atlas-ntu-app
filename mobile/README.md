# 知屿课表 Android

Single-user Expo client for the NTU Course Atlas Site.

The APK contains UI and cache logic only. Timetable, rooms, temporary changes, and course metadata come from the Site API, so ordinary data changes do not require an app release.

```bash
npm run typecheck
npm run export:android
```

Set `EXPO_PUBLIC_COURSE_ATLAS_URL` only when testing against a non-production Site. See `ARCHITECTURE.md` for data and release boundaries.
