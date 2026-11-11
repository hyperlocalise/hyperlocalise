# Browser go-svc jobs, inbox, and workspace-files cutover

**Status:** Accepted

## Decision

Use the browser `GoSvcClient` for native and organization job reads, notifications, notification preferences, mention suggestions, and native workspace files. Add focused job and inbox client modules and update existing browser callers. Remove the matching Hono read routes and their unused RPC client paths.

Keep Hono job creation, edits, retries, cancellation, agent runs, and provider-backed operations. Go job detail only serves native jobs, so provider views continue to use provider-specific APIs. No production browser caller currently requests `/workspace-files`; remove its Hono route and retain the Go client method for future use.

## Validation

Check every browser call site, add focused client and route-wiring coverage where it catches cutover errors, then run `vp test` and `vp check --fix` in `apps/hyperlocalise-web`.
