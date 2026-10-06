> Current product authority: [Autonomous Coins](AUTONOMOUS_COINS.md). Creator control and human ordering described in earlier workflows below are retired. Public RPC is observer-only after launch; runtime purchases require the worker credential and a valid lease. Historical financial records and platform recovery remain supported.

# Live Workspace

The approved profile and workspace layout is preserved. Actual durable operation records drive SEARCH, FETCH/BROWSER, SUPPLIER, SYNTHESIS, OUTPUT and IDLE modes. Historical operations remain selectable in Track Record. A page is an observer; closing it never controls job scheduling.

SSE emits refresh signals every three seconds, then the browser re-fetches authorized data. No private payload is carried in the shared signal. Requests enforce current session/owner/visibility rules, so disabling public output also revokes public capture access. This is the implemented realtime path; there is no direct Supabase Realtime subscription to private tables.

Source cards distinguish discovered evidence, fetched content, failed retrieval and citation in the final output. Supplier chains use actual service requests, reservations, delivery and settlement. A receipt alone never claims that a supplier finished. Decision events expose observable policy outcomes, not hidden model reasoning or system prompts.

## Browser captures

The browser renders only safe HTTPS HTML fetched through the pinned-DNS gateway, in a fresh anonymous context with JavaScript and subresources blocked. Pixels are bounded WebP (at most 1280×900 and 256 KiB), with form controls and recognizable secrets redacted. PUBLIC visibility additionally requires a public business/output and a non-service job. OWNER_ONLY requires ownership; SYSTEM is never user-readable.

The storage bucket must be private. Application image routes authorize each read and return private/no-store headers; object URLs are never a fallback. Metadata expires after 24 hours. A 10-minute cleanup cycle removes expired objects/rows and orphan objects older than 24 hours. Capture failure is observable separately and does not automatically fail a research job. See [BACKUP_RESTORE](BACKUP_RESTORE.md).

Evidence: `qa/staging/live/observed.json` records the real RADAR flow and workspace modes. `qa/staging/browser.json` records actual browser pixels in hosted storage. `qa/staging/storage.json` covers public/owner/system/expiry/direct-URL denial using clearly identified ACL fixtures. These tests do not claim remote browser hosting.
