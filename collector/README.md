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
3. Create three independent high-entropy secrets with `wrangler secret put`:
   `COLLECTOR_TOKEN`, `SESSION_ENCRYPTION_KEY` (32 random bytes, base64), and
   `SITES_UPLOAD_TOKEN`. Add `SITES_BYPASS_TOKEN` only if Sites requires it.
4. Deploy, then configure the Sites secrets `NTULEARN_COLLECTOR_URL` and
   `NTULEARN_COLLECTOR_TOKEN`.
5. Start `/login/start`, open the returned short-lived Live View URL, complete
   NTU SSO/MFA in the remote browser, then call `/login/finish`.

`AUTO_SYNC_ENABLED` defaults to `0`, so the cron is installed but does no work.
After the manual refresh path is verified, change it to `1` to run every 30
minutes. A failed or expired SSO session becomes `login_required`; the collector
never attempts to submit forms, launch LTI tools, or mutate course progress.
