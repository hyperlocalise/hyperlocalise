# Queries UI cutover to go-svc

## Goal

Point the Cloud Queries/Issues UI at the existing go-svc session routes. Leave CSV import on Hono until go-svc grows an import endpoint. Remove the unused Hono issue list, detail, and social routes.

## Decisions

- **Client:** Extend `GoSvcIssueSheetApi` with org inbox methods (`GET /issues`, `POST /issues/bulk-actions`, `GET /issue-sheet/search`, `GET /issue-sheet/{issueId}`).
- **UI:** Every browser Queries call uses `useGoSvcClient` except `POST …/issue-sheet/import` and mention autocomplete.
- **Activity:** go-svc already publishes `query_created` and `query_deleted` after commit. Import keeps `query_imported` on the Hono import route.
- **Hono:** Unmount org `/issues` and `/issue-sheet`. Slim project issue-sheet to `/import` only. MCP, automations, and cron keep calling TypeScript services.

## Out of scope

- Public PAT `/v1/queries`
- CSV import on go-svc
- Mentions, notifications, and notification preferences
