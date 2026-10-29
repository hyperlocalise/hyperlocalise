# Iterable templates and snippets

## Status

Proposed. Not implemented. The operator contract is
[Localize Iterable](../platform/connections/iterable.mdx). Iterable stays in the
coming-soon catalog until that connection ships.

## Date

2026-10-29

## Context

Crowdin’s Iterable app is the content contract for this skill. The store
listing syncs email, in-app, push, and SMS templates, plus snippets, in two
manual directions: select Iterable files and sync them in, then select
translated files and sync them back. In-app sync includes preview fields, and
the translated in-app message does not keep **Show in mobile inbox** enabled.
The operator page follows that list. Iterable stores a locale as another copy
of the same template. At send time Iterable picks the copy whose `locale`
matches the user profile field `locale`.

The Customer.io automation is the operational model: connect once, import into
a native project, translate in Jobs, and push approved locales as a separate
action. Import never writes to the provider.

Iterable differs from Customer.io in three ways that this design has to keep:

- A locale update on a WYSIWYG or side-by-side template changes the content the
  next send uses. Iterable has no draft state for that write. Push still must
  not trigger a campaign, send a proof, or delete a template.
- The API cannot localize a drag-and-drop template. Patching one leaves the
  editor JSON and the translated HTML out of step. Crowdin’s workaround is a
  new WYSIWYG template built from the exported HTML.
- Snippets have one `content` string and no `locale`. Overwriting that string
  replaces the source language.

Campaigns, journeys, embedded messages, and WhatsApp stay out. The integrations
catalog line that mentions campaigns and journeys is wider than this skill and
should change when the connection ships.

## Decision

Ship one workspace skill, `translate-iterable-templates`, and one activatable
workspace automation template with the same id. Display name **Translate
Iterable templates and snippets**. Primary category `popular`, also listed under
Marketing (`extraCategories: ["marketing"]`). Default trigger is scheduled;
import never pushes. Operators enqueue **Push to Iterable** separately.

Iterable has no Translation API and no locales API. Email, in-app, push, and
SMS templates each expose a `locale` on one template id; omitting `locale`
reads or writes the default copy. Snippets have one `content` string and no
`locale`; push creates or updates `{name}_{locale}`. Campaigns and journeys
are not imported. The user profile field `locale` is Iterable’s send-time
preference; this skill does not write it.

Every Iterable call uses the `Api-Key` header and the data-center host stored
for that connection. US projects use `https://api.iterable.com`. EU projects
use `https://api.eu.iterable.com`. Paths below are relative to that host.

### Connection

Store the server-side API key in WorkOS Pipes under slug `iterable`. Store only
the data center (`us` or `eu`) on `iterable_connection_settings`, keyed by
organization and WorkOS user. Same split as
`customer_io_connection_settings`.

Before save, ping `GET /api/templates?page=1&pageSize=1`. A rejected key or an
unreachable host is not stored. A read-only key can pass that ping. Push treats
HTTP 403 as a missing server-side permission.

Disconnect deletes the settings row with the Pipes account.

### What this skill does not call

- `POST /api/users/update` and any other user-profile write. The profile field
  `locale` is the customer’s send-time preference. This skill does not set it.
- Campaign trigger, schedule, or activate endpoints.
- `POST /api/templates/email/proof`, `POST /api/templates/push/proof`,
  `POST /api/templates/sms/proof`, and `POST /api/templates/inapp/proof`.
- `POST /api/templates/email/preview` and `POST /api/templates/inapp/preview`.
- `POST /api/templates/bulkDelete`, `DELETE /api/snippets/{identifier}`, and
  embedded-template routes.
- `isDefaultLocale: true` on any write. Empty `locale` remains the template
  default Iterable already has.

### Import

Import runs on a schedule, **Run now**, or Content Editor **Ingest**. It never
writes to Iterable.

Discovery:

1. `GET /api/templates` once per medium, with `messageMedium` set to `Email`,
   `Push`, `InApp`, or `SMS`. Page with `page` and `pageSize` (maximum 1000)
   until `nextPageUrl` is absent. Optional automation filters limit template
   ids. An empty filter discovers all four mediums.
2. `GET /api/snippets` for the project snippet list. Optional filters limit
   snippet ids.

For each selected template, read the default copy with `locale` omitted, then
read each mapped target locale:

| Medium | Read |
| --- | --- |
| Email | `GET /api/templates/email/get?templateId={id}&locale={locale}` |
| Push | `GET /api/templates/push/get?templateId={id}&locale={locale}` |
| SMS | `GET /api/templates/sms/get?templateId={id}&locale={locale}` |
| In-app | `GET /api/templates/inapp/get?templateId={id}&locale={locale}` |

Omit `locale` for the default copy. HTTP 404 means that locale has no content
yet. Treat that as empty. HTTP 400 means the project does not have that locale
code. Report it and skip it. Do not create project locales. Iterable has no
locales API. Operators add codes under **Project Settings**.

For each selected snippet, `GET /api/snippets/{identifier}`. Use the numeric id
when the name is only digits. Iterable treats a numeric path segment as an id.

Template list and template get are limited to 100 requests per second per
project. Keep import concurrency at 3, matching Customer.io.

### Files

Import writes:

```text
iterable/templates/email/{slug}.html
iterable/templates/in-app/{slug}.html
iterable/templates/push/{slug}.json
iterable/templates/sms/{slug}.json
iterable/snippets/{slug}.html
```

Email HTML carries `subject`, `preheaderText`, `html`, and `plainText` in field
blocks. In-app HTML carries `html` plus inbox `title`, `subtitle`, and `icon`
text. Push JSON carries `title` and `message`. SMS JSON carries `message`.
Snippet HTML is the snippet `content`.

Protect Handlebars, including `{{ }}` and `{{{ snippet "…" }}}`, the way
Customer.io protects Liquid. Translators must not break personalization or
snippet references.

`GET /api/templates/email/get` and `GET /api/templates/inapp/get` do not
document an editor field. Fail closed. If the payload does not prove WYSIWYG
or side-by-side, treat the email or in-app template as drag-and-drop. Record
the real discriminator from a fixture response before any in-place HTML write.
Push and SMS have no drag-and-drop editor.

### Locales

Match project locale tags to Iterable locale codes after hyphen and underscore
normalization. Matching is exact. `es` does not map to `es-MX`, and `fr` does
not map to `fr-FR`. Keep locked pairs apart: `en-US` is not `en-GB`, `zh-CN`
is not `zh-TW`, and `pt` is not `pt-BR`. Unmapped project locales are reported
and skipped.

The automation source locale must be the project source locale and the
language of the template’s default copy.

### Existing translations

Support `seed_empty` (default), `refresh_imported`, and `overwrite_all`, with
the same meaning as `decideCustomerIoExistingTranslationAction`.

Import uses the policy to decide whether remote locale content seeds
Hyperlocalise. Push uses it to decide whether approved copy may replace locale
content already in Iterable.

| Policy | Import into Hyperlocalise | Push to Iterable |
| --- | --- | --- |
| `seed_empty` | Seed a locale that has no Hyperlocalise translation | Write a locale whose Iterable content is missing (GET 404) or empty |
| `refresh_imported` | Re-seed only import-provenance translations whose remote hash changed | Update a locale this skill last wrote, when the approved hash changed |
| `overwrite_all` | Always seed from Iterable | Always write approved content over the Iterable locale |

### Push

**Push to Iterable** runs only when `operation=push_approved`. It is not part
of import or the schedule. It writes approved locales. It does not send.

Before an in-place template write, GET that locale again. Send only the
translated fields, plus the template id and `locale`. Iterable updates only
the fields in the body. Round-trip non-translated settings from that GET,
including in-app inbox visibility, so the update does not clear them.
Crowdin warns that a translated in-app import can drop **Show in mobile
inbox**.

| Medium | In-place write |
| --- | --- |
| Email, WYSIWYG or side-by-side | `POST /api/templates/email/update` |
| Push | `POST /api/templates/push/update` |
| SMS | `POST /api/templates/sms/update` |
| In-app, WYSIWYG or side-by-side | `POST /api/templates/inapp/update` |

Each body includes `templateId`, `locale`, and the translated fields for that
medium: email `subject`, `preheaderText`, `html`, `plainText`; push `title`
and `message`; SMS `message`; in-app `html` and inbox `title`, `subtitle`, and
`icon`.

#### Drag-and-drop clones

Never call update on the drag-and-drop template id.

On the first push of a drag-and-drop email or in-app template, create one
WYSIWYG clone from the exported default HTML. Later pushes update locales on
that clone. They do not create a second template, and they do not retarget
campaigns. The operator points a campaign at the clone.

Email clone:

1. `POST /api/templates/email/upsert` with a name that no other email template
   uses, the exported HTML, and `clientTemplateId` set to
   `hl-iterable-{sourceTemplateId}`. Upsert is required to send
   `clientTemplateId`. Upsert also updates every email template that shares
   the supplied name, so the name must be unique.
2. `GET /api/templates/getByClientTemplateId?clientTemplateId=hl-iterable-{sourceTemplateId}`
   to read the new template id.
3. `POST /api/templates/email/update` for each approved locale on that new id.

In-app clone:

1. `POST /api/templates/inapp/upsert` with a unique name, the exported HTML,
   and `clientTemplateId` set to `hl-iterable-inapp-{sourceTemplateId}`.
   Upsert requires `clientTemplateId`. The response is `msg`, `code`, and
   `params`. It does not return the new template id.
   `GET /api/templates/getByClientTemplateId` is documented for email only.
2. `GET /api/templates?messageMedium=InApp` and match the unique name to read
   the new template id.
3. `POST /api/templates/inapp/update` for each approved locale on that id.

Persist source template id to clone template id on an
`iterable_template_sync_states` row, patterned on `braze_template_sync_states`.
If the row is missing, recover an email clone with
`GET /api/templates/getByClientTemplateId` before creating another one.

#### Snippets

Never `PUT` the source snippet.

For each approved locale, `PUT /api/snippets/{name}` where `{name}` is the
source snippet name plus `_` plus the project locale tag. Example:
`Welcome_Banner` and `fr-FR` become `Welcome_Banner_fr-FR`. A name that does
not exist is created (HTTP 201). An existing name is updated (HTTP 200). Copy
`variables` from the source GET so the locale copy still accepts the same
Handlebars variables. Snippet names cannot be renamed after creation.

`{{ snippet "Welcome_Banner" }}` still renders the source snippet. The locale
copy is a library item until a template references it.

Skip suffix names that this skill would itself produce, so a later import does
not treat `Welcome_Banner_fr-FR` as a new source.

### Automation

Register the skill the way `translate-customer-io-campaigns` is registered:
import tool, push tool, `push_approved` routed to push, Content Editor ingest
and push, and settings for source locale, the three existing-translation
modes, and optional template and snippet ids.

Move `iterable` from `workspaceComingSoonCustomerEngagementSlugs` to the live
Pipes customer-engagement list in that implementation. Correct the catalog
tagline in the same change. This ADR does not do either.

## Alternatives considered

1. **Patch drag-and-drop templates in place** — rejected. Iterable documents a
   JSON and HTML mismatch. Crowdin refuses this path.
2. **Create one new template per target locale** — rejected. Iterable’s locale
   model is several locales on one template. One WYSIWYG clone can hold every
   approved locale.
3. **Overwrite snippet `content`** — rejected. The Snippets API has no locale.
   The source language would be lost.
4. **Translate campaigns and journeys in this skill** — rejected. Those objects
   send a template. The localized strings live on the template and the snippet.
5. **Set `isDefaultLocale` from the automation source locale** — rejected.
   Changing the template default changes who receives the fallback copy.
6. **Iterable Web SDK (`@iterable/web-sdk`) instead of REST** — rejected. The
   Web SDK targets browser apps with JWT-enabled web keys, user identity, and
   in-app display or event tracking. Template and snippet list/get/update and
   server-side keys require the REST Templates and Snippets API from Hyperlocalise
   server code.

## Consequences

- A WYSIWYG or side-by-side locale write is live for the next send.
- A drag-and-drop clone does not replace the template on existing campaigns.
- A locale-suffixed snippet is not what `{{ snippet "Name" }}` renders.
- The key must be server-side, and the host must be the project’s data center.
- EU projects use `https://api.eu.iterable.com`.
- Implementation and the catalog copy change follow this record. They are not
  part of the documentation change that introduces it.
