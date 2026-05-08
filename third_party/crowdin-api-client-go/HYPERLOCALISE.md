# Hyperlocalise Crowdin SDK Fork

This directory is an in-repository fork of:

`github.com/crowdin/crowdin-api-client-go v0.18.0`

The root `go.mod` uses a local `replace` directive so Hyperlocalise builds against this copy instead of the upstream module cache. Keep local patches small and document behavior changes here when fixing Crowdin SDK bugs.

## Local Patches

- Project translation builds omit `exportApprovedOnly` from the request body because Crowdin Enterprise can reject it as an unexpected field on `/translations/builds`. When `BuildProjectRequest.ExportApprovedOnly` is true and no explicit `ExportWithMinApprovalsCount` is set, the fork sends `exportWithMinApprovalsCount: 1` instead.
