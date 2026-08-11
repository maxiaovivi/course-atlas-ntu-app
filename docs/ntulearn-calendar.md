# NTULearn calendar refresh

The Course Atlas Site fetches the Blackboard shared-calendar feed only when the
client calls `POST /api/calendar/refresh`. There is no cron job, browser session,
Cloudflare Worker, or NTU password in the system.

## Runtime boundary

- `NTULEARN_ICAL_URL` is a Sites-managed secret. Never put it in Git, an APK,
  logs, R2, or an API response.
- `POST /api/calendar/refresh` validates and downloads the ICS once, removes
  private fields, and writes the last-good JSON snapshot to the existing Sites
  R2 binding.
- `GET /api/calendar` only reads that snapshot. The Android client caches the
  validated response in AsyncStorage and renders the cache before the network.
- Both endpoints are public because the Site is public. Refresh has same-origin
  browser checks, same-isolate request coalescing, a 10-minute success cooldown,
  and a 60-second failure backoff. R2 is not an atomic global rate limiter.

The public snapshot contains only an opaque ID, course code, sanitized title,
start/end time, all-day flag, and event/deadline kind. Description, UID, URL,
organizer, attendees, attachments, meeting links, credentials, and the original
ICS are discarded. A sole event that cannot be assigned to a known course is
reduced to a generic NTULearn label; unknown events in a multi-event feed are
dropped.

The feed is for events and due dates only. It does not provide announcements,
course files, or attachments.

## Validation

```bash
docker run --rm -u 1000:1000 \
  -v /home/ma-xiao/ntu_study/sites/course-atlas:/workspace \
  -w /workspace node:22-alpine npm run test:worker
```

After deployment, make one refresh request, verify only aggregate counts and the
whitelisted response shape, then repeat within ten minutes and require
`cached: true` with an unchanged `updatedAt`.
