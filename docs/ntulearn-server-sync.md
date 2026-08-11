# NTULearn server synchronization

Course Atlas uses two server components so the phone never depends on a Linux
desktop:

1. The existing Sites worker owns the public refresh endpoint, sync status,
   sanitized feed, and R2 persistence.
2. The private `collector/` Cloudflare Worker owns Browser Run, Playwright, the
   encrypted NTULearn storage state, and the callback secret.

`POST /api/ntulearn/refresh` is intentionally credential-free for the mobile
client. It is idempotent while a job is queued or running and applies a 30-minute
cooldown to bound Browser Run usage even if the public trigger is discovered. It exposes no collector URL or token. The collector endpoints
all require a high-entropy bearer token.

The collector uploads only course identifiers, course codes, titles, item type,
timestamps, and canonical `https://ntulearn.ntu.edu.sg/` URLs. It does not upload
cookies, OTPs, passwords, raw announcement bodies, student identifiers, meeting
credentials, or course files. The Sites worker validates this boundary again
before writing R2.

Normal operation is a single press on **刷新 NTULearn**. When SSO expires, the
collector reports `login_required`; an owner must complete NTU SSO/MFA through a
short-lived Browser Run Live View and finalize the session. This exceptional
login step cannot be automated safely.

The cron exists but `AUTO_SYNC_ENABLED` defaults to `0`. Enable it only after a
manual refresh has been verified against the production NTULearn account and
the Sites callback.
