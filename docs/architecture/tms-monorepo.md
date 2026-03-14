# TMS Monorepo Architecture

This repository now supports three product layers:

- `apps/cli`: the existing Hyperlocalise CLI entrypoint
- `apps/api-gateway`: the public HTTP surface for TMS integrations
- `apps/web`: the browser-based TMS frontend

Internal services live under `services/` and are isolated by domain-oriented contract boundaries:

- `projectsvc`
- `jobsvc`
- `memorysvc`
- `workflowsvc`

Contract source-of-truth rules:

- Public HTTP contracts live in `api/openapi`
- Internal service contracts live in `api/proto`
- Generated code belongs in `pkg/api`

The current implementation is intentionally a migration scaffold. Existing CLI workflows remain in-process while the TMS backend and frontend layers are added incrementally.
