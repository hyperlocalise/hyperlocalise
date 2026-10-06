# Edit research locales for a domain

## Status

Accepted

## Context

A linked domain stores its research locales in `linked_domains.market_ids`.
The Research locale control on overview, keywords, ranks, and the other
research views only switches among those saved locales. It writes `?locale=`
and leaves the saved set unchanged.

`PATCH /v1/orgs/{organizationSlug}/domains/linked-domains/{id}/markets`
already replaces that set for a verified domain. The domain detail page opens
`AddDomainDialog` in edit mode, but the dialog still presents the add-domain
wizard: the title is "Add a domain", the four-step indicator stays visible,
and the markets step continues into project assignment before save.

The domain list shows locale badges and the page store has `openEditLocales`,
but no row calls it. The research shell has an unused "Edit locales" label.
Pending domains cannot update markets. The API returns
`linked_domain_not_verified`.

`linkedDomainToResearchDomain` replaces an empty `marketIds` array with
France, Germany, Japan, and Vietnam. Those four locales appear in the
selector and the list even though they are not saved. The research shell
treats a domain with no resolved locale as a missing domain.

The checklist allows at most 16 locales. It requires at least one, unless the
domain came from a localisation audit.

## Decision

Keep the market checklist and the existing PATCH. Change edit mode into a
locales-only dialog, and open it from research, the domain list, and the
domain detail page.

### Entry points

Show **Edit locales** beside the Research locale selector on every research
view, and on each verified row in the domain list. Point the detail page's
existing edit button at the same dialog. Hide the action while the domain is
pending.

The research shell already holds `LinkedDomainPublic` from the research
query. The domain list query currently maps each record to
`DomainResearchDomain` and drops `marketIds`. Keep the linked-domain record
available to the dialog so edit mode receives the saved ids.

### Dialog

In edit mode:

- Title: **Edit locales**.
- Hide the four-step indicator and the project step.
- Show the same 39-market checklist.
- Keep the cap of 16.
- Require at least one locale unless `localisationAuditId` is set.
- **Save** calls `updateLinkedDomainMarkets` and closes on success.
- **Cancel** closes without writing.
- Leave a failed save open and show the API error.

Create mode keeps the current wizard.

### Display

Pass the saved `marketIds` into the editor. Use the four default locales only
when `marketIds` is omitted, which is the prototype path. An empty saved list
stays empty.

A verified domain with no saved locales shows an empty-locale state and
**Edit locales**. It does not show the missing-domain message. The domain list
shows no locale badges for that domain.

### After save

Invalidate the linked-domain list query and that domain's research query. On
a research page, if the locale in the URL is no longer saved, replace the URL
with the first remaining locale. If none remain, drop the `locale` parameter.

Removing a locale hides its keywords and ranks in the filtered views. It does
not delete those rows.

The Go API stays unchanged.

## Alternatives

1. **Open the current edit dialog unchanged.** The list and research pages
   could call the same component the detail page uses. The user would still
   walk through "Add a domain" and project assignment to change locales.
2. **Edit locales with a multi-select in the research header.** The active
   locale and the saved set would share one control. The domain list would
   still need a dialog, and the new control would duplicate the checklist,
   the cap, and the empty-selection rule.

## Testing

Web tests cover:

- Edit mode saves from the checklist and does not open the project step.
- Research and list actions open the dialog with the saved market ids.
- An empty `marketIds` array renders no locales. An omitted `marketIds` value
  still uses the prototype defaults.
- Removing the active locale updates the research URL to the first remaining
  locale, or removes `locale` when none remain.

Run `vp test` and `vp check --fix` in `apps/hyperlocalise-web`.
