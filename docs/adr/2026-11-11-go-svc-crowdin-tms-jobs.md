# go-svc Crowdin TMS jobs

## Status

Accepted

## Context

go-svc already lists live Crowdin projects and files with a token minted by the
web app. Job list, create, update, delete, members, and task comments still
went through Hono `/tms-provider`. The web app cannot drop those adapters until
go-svc speaks the same job contract.

## Decision

Keep credential decrypt and OAuth refresh in the web mint route. Add a Crowdin
`JobOperator` in `tmscatalog` and expose it on go-svc:

- `GET /tms/jobs` and `GET /projects/ext:crowdin:…/jobs` (`mine`, `recent`)
- `POST /projects/ext:crowdin:…/jobs`
- `GET /jobs/ext:crowdin:…:…` plus PATCH, DELETE, files, and comments
- `GET /projects/ext:crowdin:…/members`
- live `open-job-count` for Crowdin projects

JSON matches Hono's live job envelope so the web `GoSvcTmsApi` can replace
`/tms-provider` later. The UI still calls Hono. Phrase, Lokalise, Smartling
jobs, and CAT stay on Hono.

Per-user Crowdin OAuth/PAT with `mine=true` uses `/user/tasks`. Partial create
returns HTTP 207 `provider_task_create_partial`.

## Consequences

- Crowdin job traffic depends on the mint route, as project and file reads
  already do.
- A later Hono cutover is a client switch, not a new mapping.
- Other TMS providers need their own `JobOperator` before their live jobs can
  leave Hono.
