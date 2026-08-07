# PDF delivery design

The public front end must not contain the course PDF corpus. Store PDFs in private
object storage and expose only reviewed material records through the application
API.

## Request flow

1. `GET /api/courses/:courseId/shelves/:shelfId/materials` returns lightweight
   metadata only: title, page count, file size, revision, and thumbnail URLs.
2. `POST /api/materials/:materialId/session` checks the current viewer and returns
   a short-lived, read-only PDF URL plus the document revision.
3. The reader requests byte ranges from that URL. The storage response must include
   `Accept-Ranges: bytes`, a correct PDF content type, and a stable `ETag`.
4. The browser renders the visible page and its two neighbours. Remaining pages
   stay unrendered until they approach the viewport.

## Response shape

```json
{
  "material": {
    "id": "ee6221-lecture-01",
    "title": "Lecture 01",
    "pageCount": 42,
    "revision": "sha256:…"
  },
  "asset": {
    "url": "https://storage.example/signed-url",
    "expiresAt": "2026-08-07T16:00:00Z",
    "supportsRange": true
  }
}
```

## Performance rules

- Generate small WebP page thumbnails during ingestion; do not render every
  thumbnail from the full PDF on first open.
- Cache immutable file revisions at the edge, while keeping API and signed URL
  responses private and short-lived.
- Cancel stale page renders during fast scrolling and cap concurrent canvas work.
- Persist reading position as metadata, never by rewriting the original PDF.
- Return a new revision when a file is replaced so old cached pages cannot mix
  with the new document.

## Access rules

- Keep source files private by default and review each course shelf before sharing.
- Authorize every reader session server-side; a hidden front-end URL is not access
  control.
- Keep upload and administration endpoints separate from the public reader API.
- Never ingest `.private/`, email imports, or local mail configuration.
