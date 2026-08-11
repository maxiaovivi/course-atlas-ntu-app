# Schedule and agenda data

`GET /api/schedule` serves one version-1 payload containing the weekly course
sessions, temporary exceptions, and a compact agenda for assessments, deadlines,
academic-calendar entries, and notices.

`teachingStart`, `teachingEnd`, and `teachingBreaks` are optional version-1
fields. New clients use them to avoid presenting a weekly class during recess or
after the final teaching week; older clients safely ignore them.

## Runtime precedence

1. The production payload is UTF-8 split across contiguous Sites-managed
   secrets named `COURSE_ATLAS_DATA_JSON_1`, `_2`, and so on. Each chunk stays
   at or below 4 KiB; the worker joins and validates them before serving, without
   requiring R2. The unsuffixed `COURSE_ATLAS_DATA_JSON` remains a local/test
   convenience only because a full real payload can exceed a hosted secret's
   per-value limit.
2. A configured but invalid secret fails closed with HTTP 503. It never exposes
   an older R2 object or repository fixture by accident.
3. When the secret is absent, the worker reads the last schedule written to R2.
4. An empty R2 bucket is initialized with the deliberately fictional
   `DEFAULT_SCHEDULE`.

The protected `PUT /api/admin/schedule` route remains available as an R2
fallback. While the secret is configured, the secret still wins on reads.

## Repository boundary

- `data/schedule.json` is ignored and is the local input for real runtime data.
- `data/schedule.example.json`, `DEFAULT_SCHEDULE`, and tests contain only
  clearly fictional fixtures.
- Never commit current course times, rooms, assessments, notices, personal
  dates, subscription URLs, credentials, or runtime API snapshots.

Before configuring Sites, minify and UTF-8 split the local file at code-point
boundaries into chunks of at most 4 KiB. Set all chunk secrets in one Sites
environment revision, remove any stale higher-numbered chunk, and deploy that
revision. Do not pass the payload through a shell command that prints it.

## Agenda contract

Every response contains `agenda: []`. Each item has:

- `id`: lowercase letters, digits, and hyphens, 8–120 characters;
- `type`: `quiz`, `ca`, `deadline`, `academic`, or `notice`;
- `courseCode`: a code present in `courses`, or `null` for institution-wide
  entries;
- `title`: 1–180 characters;
- `start` and `end`: an ISO instant, a `YYYY-MM-DD` calendar date, or `null`;
- `location`: text or `null`;
- `certainty`: `confirmed`, `inferred`, or `pending`;
- `detail`: text or `null`.

`version` remains `1`, so older clients that ignore the additional `agenda`
field can continue to read the timetable.
