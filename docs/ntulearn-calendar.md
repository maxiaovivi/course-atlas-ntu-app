# NTULearn calendar refresh

The Course Atlas Site fetches the Blackboard shared-calendar feed only when the
client calls `POST /api/calendar/refresh`. There is no cron job, browser session,
Cloudflare Worker, or NTU password in the system.

## Runtime boundary

- `NTULEARN_ICAL_URL` is a Sites-managed secret. Never put it in Git, an APK,
  logs, R2, or an API response.
- `POST /api/calendar/refresh` validates and downloads the ICS once, keeps the
  decoded `SUMMARY` content and time needed by the app, and writes the last-good
  JSON snapshot to the existing Sites R2 binding.
- `GET /api/calendar` only reads that snapshot. The Android client caches the
  validated response in AsyncStorage and renders the cache before the network.
- Both endpoints are public because the Site is public. Refresh has same-origin
  browser checks, same-isolate request coalescing, a 10-minute success cooldown,
  and a 60-second failure backoff. R2 is not an atomic global rate limiter.

The public snapshot contains only an opaque ID, course code, decoded title,
start/end time, all-day flag, and event/deadline kind. Control characters and
excess whitespace are normalized and titles are capped at 180 characters, but
their content is not selectively redacted.
Description, UID, URL, organizer, attendees, attachments, and the original ICS
are discarded as separate fields. Text already present inside `SUMMARY` is kept
without content-specific redaction, subject to the normalization and length cap
above. Every valid non-recurring event is retained;
unclassified events use the generic course code `NTU` while preserving their
title. Because both endpoints are public, anyone with the Site URL can read this
runtime snapshot; this is an explicit single-user convenience tradeoff.

GitHub has a different boundary: source, tests, docs, commits, and build inputs
must never contain the real feed URL, real event data, NTULearn internal IDs,
cookies, account email, or other credentials. Tests use deliberately fictional
fixtures only. Runtime titles flow from the Sites secret to R2 and the API; they
are never generated into the repository or static build.

Recurring rules are not expanded in the first version and are reported through
`ignoredRecurring`. The feed is for events and due dates only. It does not
provide announcements, course files, or attachments.

## Validation

```bash
docker run --rm -u 1000:1000 \
  -v /home/ma-xiao/ntu_study/sites/course-atlas:/workspace \
  -w /workspace node:22-alpine npm run test:worker
```

After deployment, make one refresh request, verify only aggregate counts and the
expected response shape in logs, then repeat within ten minutes and require
`cached: true` with an unchanged `updatedAt`. Do not print runtime titles or the
feed URL into deployment logs.
