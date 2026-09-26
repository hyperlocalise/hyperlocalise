# CLI Cloud path aliases

Consolidating configs at the repository root changes config-relative local paths.
Cloud sync must preserve the existing source identities to reuse translations.

Add an optional `cloud_path` to each bucket file mapping. Keep `from` and `to`
responsible for local reads and writes. Resolve the alias for upload metadata and
both whole-file and segment-export downloads. Default to the local source path
when the option is absent. Preserve recursive relative paths and support the
source locale token. Reject unsafe paths and collisions before network requests.

A per-mapping path fits the existing `from`/`to` model and supports exact files and
folder trees. A global prefix rewrite would couple unrelated buckets; a bucket
root would not support individual file names. No Cloud API change is required.

Verify uploads read local content while sending the preserved identity, downloads
use that identity and write local targets, nested mappings preserve paths, and
invalid paths or collisions fail. Keep existing repository configs and CI pins
until a CLI release makes the option available.
