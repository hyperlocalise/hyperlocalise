# Object storage

`Store` is the shared byte-storage contract for uploaded files and generated
translation bundles. `s3compat.New` supports AWS S3 and Cloudflare R2 through the
AWS SDK for Go v2. `vercelblob.New` reads and writes the Vercel Blob store the web app
keeps stored files in, over the same HTTP API as `@vercel/blob` (`vercelblob.FromEnv` uses
`BLOB_READ_WRITE_TOKEN` and `FILE_STORAGE_ACCESS`). `memory.New` provides the same contract for tests.

Persist both `Ref.LocationID` and `Ref.Key`. Resolve reads through the recorded
location, never through the default write location. A location ID must always
refer to the same bucket/account; create a new ID when moving buckets. Credentials
may rotate without changing location identity. Keep prior locations configured
until their objects are migrated or deleted.

`Put` accepts an `io.Reader` and known byte size. Get bodies belong to callers and
must be closed. A streaming reader may not support SDK retries; replayable jobs
should reopen their source before retrying. `IfAbsent` uses conditional creation.
ETags are opaque; they must not be treated as SHA-256 or MD5 checksums.

Presigned requests include required headers, method and expiry. TTLs are limited
to one hour and may be shortened by temporary credential expiry. Bucket CORS must
allow the browser's origin, method and signed headers. Upload signing does not
finalize a file: check stored size/type and required integrity/content validation
before committing the file record. The application allocates keys and authorizes
access; drivers never accept arbitrary endpoints or credentials from users.

Use `internal/distribution.Publisher` to publish immutable JSON locale bundles.
It conditionally creates objects, verifies stored bytes, and creates the manifest
last. A release channel is updated separately in the application database after
success. Configure CDN delivery separately; private bundles require private
caching/authentication policies rather than the public publisher policy.
