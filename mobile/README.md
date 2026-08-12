# 知屿课表 Android

Single-user Expo client for the NTU Course Atlas Site.

The APK contains UI and cache logic only. Timetable, rooms, temporary changes,
Quiz/CA dates, concise official academic-calendar periods, course notices,
the runtime NTULearn calendar snapshot, and the exam-driven memory deck come
from the Site API, so ordinary data changes do not require an app release. Real
runtime content and the private feed URL are never bundled into GitHub source or
the APK. Pull-to-refresh updates the timetable, calendar, material catalog, and
memory deck; the passive footer identifies the installed update by publish time.

The home screen is intentionally glanceable: next class, the next no-class
period, at most three near-term items, and the fixed timetable. The
calligraphic face is limited to short display labels; all dates, times, rooms,
and course data use the system sans-serif face. Tapping any course opens its
cached, dated “上节课后 / 下节课前” brief; no brief text is duplicated on the
home screen and no second request is needed.

The memory card on the home screen is a continuous, bidirectional carousel—not
a daily card. Swipe either way for another prompt; tap once for the full answer,
native RaTeX formula, terminology, and a conditional “易错” note. Course tabs
and the same left/right gesture remain available in the full-screen deck. RaTeX
parses in Rust and draws directly to the Android Canvas; there is no formula
WebView or DOM surface.

```bash
npm run typecheck
npm run export:android
```

Set `EXPO_PUBLIC_COURSE_ATLAS_URL` only when testing against a non-production Site. See `ARCHITECTURE.md` for data and release boundaries.
