# Project file browser capacity

## Decision

Show 500 project files in the first browser batch and retain the existing
1,000-file cap with a second load-more batch. Increase the file tree viewport
from 320 to 480 pixels so users can scan more paths without scrolling the page.

## Provider behavior

The project files API already accepts limits up to 1,000. External TMS adapters
paginate their provider APIs and return the requested slice, so a 500-file
browser batch works for native and provider-backed projects.

## Verification

Update focused component tests for the new batch size and tree height. Run
`vp test` and `vp check --fix` from `apps/hyperlocalise-web`.
