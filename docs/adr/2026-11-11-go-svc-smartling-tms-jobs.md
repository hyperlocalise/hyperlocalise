# go-svc Smartling TMS jobs

## Status

Accepted

## Context

go-svc already lists live Smartling projects and files with a token minted by
the web app. Job list, detail, files, and title/description updates still went
through Hono `/tms-provider`. Crowdin jobs already use a `JobOperator`. The web
app cannot drop the Smartling adapters until go-svc speaks the same job
contract.

Smartling jobs are not Crowdin tasks. File ids are URIs, job ids are UIDs, and
Hono never creates, deletes, lists members, reads task comments, or assigns
people on Smartling jobs.

## Decision

Add a Smartling `JobOperator` in `tmscatalog` and expose the same live job
routes Crowdin uses, with Smartling's Hono behavior:

- `GET /tms/jobs` and `GET /projects/ext:smartling:…/jobs`
- `GET /jobs/ext:smartling:…:…` plus PATCH title/description and files
- live `open-job-count` for Smartling projects
- `501` for create, delete, members, and comments
- `400 unsupported_job_field_update` for assignee edits

JSON matches Hono's live job envelope, including Smartling status mapping
(`PUBLISHED` succeeds, `AWAITING_AUTHORIZATION` is queued, `In Review` waits
for review). The UI still calls Hono. Phrase and Lokalise jobs, and CAT, stay
on Hono.

## Consequences

- Smartling job traffic depends on the mint route, as project and file reads
  already do.
- A later Hono cutover is a client switch, not a new mapping.
- Creating Smartling jobs, assigning people, and task comments remain Hono's
  "unsupported" responses until Smartling grows those APIs in the web adapter.
