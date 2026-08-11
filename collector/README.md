# NTULearn collector

Private Cloudflare Worker for Course Atlas. It runs Playwright in Browser Run,
restores an encrypted NTULearn storage state, reads course metadata, and sends a
sanitized snapshot to the existing Sites backend.

The public app never receives the collector token, NTU cookies, SSO state, OTPs,
or announcement bodies. `/refresh`, `/status`, and `/login/*` require
`COLLECTOR_TOKEN`.

## Provision once

1. Log in to Cloudflare with Wrangler.
2. Create a KV namespace and replace `REPLACE_WITH_KV_NAMESPACE_ID` in
   `wrangler.jsonc`.
3. Create `COLLECTOR_TOKEN` and `SESSION_ENCRYPTION_KEY` (32 random bytes,
   base64) as independent high-entropy secrets. Create one more dedicated shared
   value: store it as collector `SITES_UPLOAD_TOKEN` and Sites
   `NTULEARN_UPLOAD_TOKEN`. Do not reuse or rotate the existing PDF
   `UPLOAD_TOKEN`. Add `SITES_BYPASS_TOKEN` only if Sites requires it.
4. Deploy, then configure the Sites secrets `NTULEARN_COLLECTOR_URL`,
   `NTULEARN_COLLECTOR_TOKEN`, and the matching `NTULEARN_UPLOAD_TOKEN`.
5. Start `/login/start`, open the returned short-lived Live View URL, complete
   NTU SSO/MFA in the remote browser, then call `/login/finish`.

There is no cron trigger. `POST /refresh` keeps that request open, performs one
bounded sync, closes the launched browser, and returns the final `status`; it
does not delegate the work to `waitUntil`. The initial smoke test targets
EE6497 and at most ten announcement rows. The Live View session is disconnected
while the owner logs in, then explicitly closed after `/login/finish` saves the
encrypted storage state. A failed or expired SSO session becomes
`login_required`; the collector never attempts to submit forms, launch LTI
tools, or mutate course progress.
