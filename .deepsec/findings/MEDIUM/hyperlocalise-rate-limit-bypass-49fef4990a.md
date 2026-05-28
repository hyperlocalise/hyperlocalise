# [MEDIUM] Public MCP client registration can be abused for persistent database growth

**File:** [`apps/hyperlocalise-web/src/app/mcp/[[...route]]/route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/app/mcp/[[...route]]/route.ts#L5-L8) (lines 5, 8)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `rate-limit-bypass`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The handler exposes the imported /mcp/register endpoint via POST. That endpoint is intentionally unauthenticated when MCP auth is enabled, accepts up to a 256KB request body, and inserts a new mcp_oauth_clients row for every valid request. I found no route-local or global rate limiter, quota, authentication requirement, or expiry/cleanup for registered clients. A remote attacker can repeatedly register clients and grow the database, causing storage pressure and operational impact. This public registration also amplifies the OAuth token-grant issue because attackers can create their own valid client IDs and redirect URIs.

## Recommendation

Add per-IP and/or per-account rate limits to MCP registration, require authentication or administrative approval for dynamic clients, enforce quotas, and add expiry/cleanup for unused client registrations. Consider disabling dynamic registration unless it is required for trusted MCP clients.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-13)
