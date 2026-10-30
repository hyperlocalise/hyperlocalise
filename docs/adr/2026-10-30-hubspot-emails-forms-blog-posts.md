# HubSpot emails, forms, and blog posts

## Status

Accepted. Import, push, and **Translate HubSpot content** are
implemented. Connect is WorkOS Pipes OAuth on the existing `hubspot`
slug, from a custom Integrations pane.

Tracking lives in Linear project
[HubSpot Integration](https://linear.app/hyperlocalise/project/hubspot-integration-4fd159902d9b)
(`P-HL-40`).

| Issue | Work |
| --- | --- |
| [HL-900](https://linear.app/hyperlocalise/issue/HL-900/write-the-hubspot-localisation-design) | This design |
| [HL-901](https://linear.app/hyperlocalise/issue/HL-901/connect-hubspot-with-a-private-app-access-token) | Superseded by OAuth |
| [HL-902](https://linear.app/hyperlocalise/issue/HL-902/enable-an-api-key-install-on-the-hubspot-pipes-slug) | Not used. Connect is OAuth only. |
| [HL-903](https://linear.app/hyperlocalise/issue/HL-903/import-hubspot-emails-forms-and-blog-posts) | Import |
| [HL-904](https://linear.app/hyperlocalise/issue/HL-904/push-approved-hubspot-locale-copies) | Push |
| [HL-905](https://linear.app/hyperlocalise/issue/HL-905/add-the-translate-hubspot-content-template) | Automation template |
| [HL-906](https://linear.app/hyperlocalise/issue/HL-906/connect-hubspot-with-oauth) | OAuth connection |

Product docs live on one page,
`docs/platform/connections/hubspot.mdx`.

## Date

2026-10-30

## Context

HubSpot is a customer-engagement catalog row and a WorkOS Pipes slug.
Operators connect with OAuth from a custom HubSpot pane. Do not add a
second Pipes provider.

Operators need five content surfaces:

| Surface | Read | Write-back | HubSpot translation |
| --- | --- | --- | --- |
| Marketing emails | Subject, preview, and widget fields | `clone` with `cloneName`, then `upsertDraft` to set `language` and the translated widgets | No. Clone copies the source widgets. Language is set on the draft. |
| Forms | Labels, placeholders, help text, submit text, legal copy | `create` a new form | No. `configuration.language` selects built-in chrome only. |
| Blog posts | `htmlTitle`, `metaDescription`, `postBody` | `createLangVariation`, then patch the draft | No. The call clones an untranslated variant. |
| Landing pages | Title, meta description, alt text, widgets, layout sections | `createLangVariation`, then `updateDraft` | No. The call clones an untranslated variant. |
| Website pages | Same fields as landing pages | `createLangVariation`, then `updateDraft` | No. The call clones an untranslated variant. |

HubSpot's Breeze and DeepL actions live in the product UI. They are
not a public translate API. A/B email variations
(`createAbTestVariation`) are tests, not language copies.

The official client is `@hubspot/api-client`. The OAuth access token
constructs `new Client({ accessToken })`.

## Decision

Implement one workspace skill, **Translate HubSpot content**
(`translate-hubspot-content`), on the Popular and Marketing template
lists. Scheduled or manual import opens native jobs. Push runs only
when an operator asks. Never edit the source object. Never publish or
send.

1. Import primary objects only.
   - Marketing emails at `hubspot/emails/{slug}.json`.
   - Forms at `hubspot/forms/{slug}.json`. Field names and property
     bindings stay locked.
   - Blog posts at `hubspot/blog-posts/{slug}.html`. Skip posts with
     `translatedFromId` set.
   - Landing pages at `hubspot/landing-pages/{id}/{slug}.json` and
     website pages at `hubspot/website-pages/{id}/{slug}.json`. Skip
     pages with `translatedFromId` set. Widget ids, URLs, and colors
     stay locked.
   - Skip names that already look like locale copies
     (`Welcome [fr-FR]`).
2. Push approved locales as separate copies named
   `{source} [{locale}]`. The name keeps the full project tag.
3. Map project locales onto HubSpot's lowercase codes. Keep `fr` and
   `fr-ca` distinct. See Locale map.
4. Call HubSpot only through `@hubspot/api-client`. Load the OAuth
   access token with `loadPipesAccessToken` and construct
   `new Client({ accessToken })`.
5. Use the orange sprocket at
   `apps/hyperlocalise-web/public/images/hubspot-logo.svg` for the
   catalog row, the connection pane, and the template. Do not use
   `siHubspot`. Do not invert the mark in dark mode. The fill is
   `#ff4800`.

## API usage

Construct `new Client({ accessToken })` with the OAuth access token.
Do not call `api.hubapi.com` with `fetch`. If a method is missing,
bump `@hubspot/api-client`. Do not add a REST fallback.

The OAuth app needs `content` for marketing emails, CMS blog posts,
landing pages, and website pages, and `forms` for forms. Those scopes
are granted when the operator authorizes HubSpot.

| Surface | SDK | Read | Write-back |
| --- | --- | --- | --- |
| Marketing emails | `client.marketing.emails.marketingEmailsApi` | `getPage` and `getById` | `clone` with `id` and `cloneName`, then `upsertDraft` to set `language`, `name`, `subject`, and `content.widgets`. The clone request has no `language` field. Do not call `createAbTestVariation` or publish. |
| Blog posts | `client.cms.blogs.blogPosts.basicApi` and `multiLanguageApi` | List and get. Primaries are `translatedFromId__is_null`. | `createLangVariation({ id, language })`, then patch the draft `name`, `htmlTitle`, `postBody`, and `metaDescription`. Reuse an existing variant in that language. Never call push-live. |
| Landing pages | `client.cms.pages.landingPagesApi` | `getPage` and `getById`. Skip rows with `translatedFromId`. | `createLangVariation({ id, language })`, then `updateDraft` with `name`, `language`, `htmlTitle`, `metaDescription`, `featuredImageAltText`, `widgets`, and `layoutSections`. Never publish. |
| Website pages | `client.cms.pages.sitePagesApi` | Same as landing pages. | Same write-back as landing pages. Never publish. |
| Forms | `client.marketing.forms.formsApi` | Get the definition | `create` a new form. There is no clone endpoint and no language group. |

Forms `2026-09-beta` is still beta. Stay on the SDK's forms client.
Do not hand-write that URL.

Creating a form makes it exist in the portal. It does not replace the
source form on a live page. Do not patch the source form's labels.

## Locale map

HubSpot codes are lowercase BCP 47 with a hyphen: `fr`, `fr-ca`,
`pt-br`, `en-gb`, `zh-cn`, `zh-tw`, `es-mx`, `he-il`, `no-no`.
`fr` and `fr-ca` are different languages. Do not collapse every tag
to the primary subtag the way Loops does.

Map a project locale by lowercasing it and turning `_` into `-`, then:

1. Use that code when the surface accepts it.
2. Apply the aliases HubSpot uses: `zh-Hans` and `zh-CN` become
   `zh-cn`; `zh-Hant` and `zh-TW` become `zh-tw`, then `zh-hk` only
   when `zh-tw` is not accepted; `nb`, `nn`, and `no` become `no-no`;
   `he` becomes `he-il`.
3. Fall back to the primary subtag only when that primary code is
   accepted. `fr-FR` becomes `fr`. `de-DE` becomes `de`.
4. Leave every other locale unmapped. Do not pick a region.

Emails check `EmailCreateRequestLanguageEnum`. Forms check the
`configuration.language` enum (`en`, `en-gb`, `fr`, `fr-ca`, `pt`,
`pt-br`, `es`, `es-mx`, `zh-cn`, `zh-hk`, `zh-tw`, `no-no`, `he-il`,
and the rest of that closed list). Blog variations use the same
mapper, and HubSpot still rejects a language the account has not
enabled.

One HubSpot code holds one copy. When `fr-FR` and `fr` both become
`fr`, skip the second locale as a collision. Copy names still keep
the full project tag, so `Welcome [fr-FR]` and a later `Welcome [fr]`
stay distinct in the name even when they share a code.

The source object's language must map to the project source locale.

## Translation

Hyperlocalise translates. HubSpot does not.

`clone` and `createLangVariation` copy source content into the target
language. The push then writes Hyperlocalise's approved strings onto
that copy. `configuration.language` on a form selects HubSpot's
built-in validation and date-picker strings. Custom labels are the
strings we write.

## Connection

Operators connect from the HubSpot pane on **Integrations**. Take
`hubspot` off the generic `<Pipes>` list and mount that pane. **Connect**
opens the WorkOS Pipes authorize URL for slug `hubspot`. Do not embed
the generic `<Pipes>` widget and do not offer a private-app token field.

Read the grant with `loadPipesAccessToken` on slug `hubspot`. Do not
call `loadPipesApiKey` or `upsertPipesApiKey`. Do not store the token
in Postgres. Do not create a second provider that shadows `hubspot`.

When the grant needs reconnecting, the pane asks the operator to
connect again. There is no stored token to fall back to.

## Logo

Copy the sprocket from the desktop SVG to
`apps/hyperlocalise-web/public/images/hubspot-logo.svg`. The catalog
row uses `logoSrc: "/images/hubspot-logo.svg"`. The connection pane,
template flow, and tool icon use `IntegrationLogo` with that path,
the same way Braze uses `/images/braze-logo.svg`.

## Alternatives considered

1. **One skill per surface** — rejected. Emails, forms, and blog
   posts share one connection, one locale mapper, and the same rule
   that the source object stays untouched. Write-back differs inside
   the skill.
2. **Primary-subtag language codes for every locale** — rejected.
   That merges `fr-CA` into `fr` and `pt-BR` into `pt`. HubSpot treats
   those as different languages.
3. **Raw REST, or a second Pipes provider** — rejected. The Node SDK
   covers the three surfaces. The catalog slug is already `hubspot`.
4. **A private-app access token** — rejected. Operators authorize
   HubSpot. The pane does not ask them to create a private app.
5. **`siHubspot`** — rejected. The mark is the orange sprocket SVG.
6. **HubSpot Breeze or DeepL as the translator** — rejected. Those
   actions are not a public API.
7. **A/B email variations, blog push-live, or patching the source
   form** — rejected. Each one either publishes, sends, or edits the
   source.

## Consequences

- Connect, import, push, and the template are available. Operators
  authorize HubSpot from the custom pane.
- Regional project locales that collapse to one HubSpot code cannot
  both be pushed. The run reports the collision.
- A new form exists in the portal as soon as push creates it. It is
  a separate form. Live pages keep the source form until someone
  embeds the new one in HubSpot.
