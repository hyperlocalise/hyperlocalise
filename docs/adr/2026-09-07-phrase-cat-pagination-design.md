# Phrase CAT filtered pagination continuation

## Problem

Phrase CAT queues apply search and tag filters client-side. The provider bounds
the number of API pages scanned per request, but previously reported the queue
as exhausted when that bound was reached before Phrase's key set was exhausted.

## Design

Keep the scan budget as a safety limit. When the budget ends without filling the
requested page, return `hasMore: true` with a cursor for the next Phrase page.
The next request resumes from that page and continues applying the same filters.
When Phrase returns a short page, mark the scan complete and preserve the
existing end-of-queue behavior.

## Validation

The Phrase live CAT tests cover a match resumed after the scan budget and verify
that the continuation page is requested without restarting at page one.
