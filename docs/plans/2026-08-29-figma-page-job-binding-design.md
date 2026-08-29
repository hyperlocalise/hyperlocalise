# Figma page job binding

Date: 2026-08-29

## Decision

Bind each Figma page to its latest Hyperlocalise job with plugin data on the page, and treat the server as source of truth.

`figma.clientStorage.lastJobId` is not the identity. It is one pointer for the whole plugin on that client.

## Binding

On the current page node, `hyperlocalise:binding:v1` stores:

```json
{ "projectId": "proj_…", "jobId": "job_…", "sourcePath": "figma/files/…/pages/….json" }
```

Write it after create, generate, or pull. On boot and page change, read it, then confirm with:

`GET /api/integrations/figma/jobs/current?fileKey&pageId&projectId?`

The lookup matches `input_payload.metadata` (`integration=figma-plugin`, `figmaFileKey`, `figmaPageId`) and returns the latest job in any status. If `projectId` is omitted, search accessible projects in the org.

If the server job differs, overwrite plugin data. If the server has no job, clear plugin data.

## Status and pull

`GET /jobs/:jobId` returns the real status: `queued`, `running`, `waiting_for_review`, `succeeded`, `failed`, `cancelled`. Failed jobs are a 200 body, not a thrown 502.

Pull uses that latest page job. `waiting_for_review` is pullable when output files exist. Queued or running jobs are not.

## Plugin UI

A job card sits above the extract/create actions. Coarse phases only. Poll while `queued` or `running` without locking the rest of the panel. **Open in Hyperlocalise** links to `/org/{slug}/projects/{projectId}/jobs/{jobId}`.
