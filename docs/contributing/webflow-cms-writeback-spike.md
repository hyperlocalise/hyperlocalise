# Webflow CMS secondary-locale writeback spike (HL-894)

## Summary

Hyperlocalise writes staged CMS item variants with `PATCH /v2/collections/{collection_id}/items/{item_id}?cmsLocaleId={target}` and publishes with `POST .../items/{item_id}/publish` body `{ cmsLocaleIds: [target] }`.

## Version conflicts

Unlike Contentful CMA entries, Webflow staged item PATCH does not expose a version header for optimistic locking in v2. Concurrent edits last-write-wins on the patched fields. Import/push therefore uses source content hashes (`webflow_item_sync_states.sourceHash`) to skip or flag `source_changed` instead of 409 retry loops.

## Rich Text components

Secondary-locale PATCH must preserve existing `data-w-id` on every `<wf-component>`. Creating new component instances in a secondary locale returns HTTP 400. Push validates component integrity before write (see `wf-component.ts`).

## Manual verification checklist

1. Generate a site API token in Webflow (**Site settings → Apps & integrations → API access → Generate API token**) with `sites:read`, `cms:read`, `cms:write` (plus `components:read` for component fields), and paste it as the site token.
2. Pick a collection item with Rich Text containing `<wf-component>`.
3. PATCH a translated PlainText/RichText field for `cmsLocaleId` of an enabled secondary locale.
4. Publish that locale only via publish endpoint.
5. Confirm primary locale content unchanged in Designer.
