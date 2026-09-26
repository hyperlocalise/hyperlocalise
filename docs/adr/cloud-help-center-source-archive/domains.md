<!-- Historical reference, not current product documentation. -->
---
title: "Domains"
description: "Link hostnames, verify ownership, and run keyword research and rank tracking per market."
---

Domains connects SEO research to the hostnames your team localizes. Link a domain, prove you control it, then explore keywords, SERPs, and rank tracking for each supported market.

The **Domains** item appears in the organization sidebar when the `workspace-domains` feature flag is enabled for your workspace.

## Link and verify a domain

1. Open **Domains** in the sidebar.
2. Click **Link domain** and enter the hostname (for example `example.com`).
3. Complete verification on the link-domain page. Hyperlocalise supports:
   - **DNS TXT** — add a TXT record at `_hyperlocalise.{domain}`
   - **HTML file** — upload a token file to the site root
   - **Meta tag** — add a `<meta>` tag to the homepage
4. Click **Verify** when the record or file is live.

Verification is attached to the **hostname**, not to individual markets. The first organization to verify a hostname owns that claim globally; another org cannot verify the same hostname while it stays verified.

You can browse the research catalog before verification finishes. Keyword expansion, saving, SERP lookups, and rank tracking require a **verified** domain.

Pending claims can be cancelled from the domain list. Verified domains cannot be deleted through the API.

## Research surfaces

Open a linked domain to switch the sidebar to domain-scoped navigation. Each surface is its own route under `/org/{slug}/domains/{domainId}/…`.

| Surface | Route suffix | What it does today |
| --- | --- | --- |
| **Overview** | `/overview` (default) | High-level metrics derived from tracked keywords |
| **Keyword research** | `/keywords` | Expand seed keywords, inspect SERPs, save ideas |
| **Rank tracking** | `/ranks` | Track and refresh live rank positions |
| **AI visibility** | `/brand` | Placeholder on live domains (prototype fixtures only) |
| **Prompt explorer** | `/prompts` | Placeholder on live domains (prototype fixtures only) |

The locale selector lives in the page header, not as a separate tab. Pick a market to filter metrics and research data. The selected market persists in the URL as `?locale={marketId}` and stays when you move between surfaces.

If a market has no saved data yet, the UI shows an explicit empty state instead of mixing in another locale's metrics.

## Supported markets

Live domains currently expose these 39 research markets. The market ID, label, language, and DataForSEO location mapping come from the shared application catalog.

| Market ID | Location | Label |
| --- | --- | --- |
| `france-fr` | France | French (France) |
| `germany-de` | Germany | German (Germany) |
| `japan-ja` | Japan | Japanese (Japan) |
| `vietnam-vi` | Vietnam | Vietnamese (Vietnam) |
| `united-states-en` | United States | English (United States) |
| `united-kingdom-en` | United Kingdom | English (United Kingdom) |
| `australia-en` | Australia | English (Australia) |
| `india-en` | India | English (India) |
| `spain-es` | Spain | Spanish (Spain) |
| `mexico-es` | Mexico | Spanish (Mexico) |
| `canada-fr` | Canada | French (Canada) |
| `italy-it` | Italy | Italian (Italy) |
| `brazil-pt` | Brazil | Portuguese (Brazil) |
| `portugal-pt` | Portugal | Portuguese (Portugal) |
| `netherlands-nl` | Netherlands | Dutch (Netherlands) |
| `sweden-sv` | Sweden | Swedish (Sweden) |
| `denmark-da` | Denmark | Danish (Denmark) |
| `norway-nb` | Norway | Norwegian (Norway) |
| `finland-fi` | Finland | Finnish (Finland) |
| `poland-pl` | Poland | Polish (Poland) |
| `czechia-cs` | Czechia | Czech (Czechia) |
| `hungary-hu` | Hungary | Hungarian (Hungary) |
| `romania-ro` | Romania | Romanian (Romania) |
| `greece-el` | Greece | Greek (Greece) |
| `turkey-tr` | Türkiye | Turkish (Türkiye) |
| `russia-ru` | Russia | Russian (Russia) |
| `ukraine-uk` | Ukraine | Ukrainian (Ukraine) |
| `saudi-arabia-ar` | Saudi Arabia | Arabic (Saudi Arabia) |
| `israel-he` | Israel | Hebrew (Israel) |
| `iran-fa` | Iran | Persian (Iran) |
| `bangladesh-bn` | Bangladesh | Bengali (Bangladesh) |
| `indonesia-id` | Indonesia | Indonesian (Indonesia) |
| `malaysia-ms` | Malaysia | Malay (Malaysia) |
| `thailand-th` | Thailand | Thai (Thailand) |
| `philippines-fil` | Philippines | Filipino (Philippines) |
| `china-zh` | China | Chinese (China) |
| `taiwan-zh` | Taiwan | Chinese (Taiwan) |
| `hong-kong-zh` | Hong Kong | Chinese (Hong Kong) |
| `south-korea-ko` | South Korea | Korean (South Korea) |

Every verified domain can use any supported market. Research rows are stored per market in Postgres (`marketId`, DataForSEO `locationCode`, and `languageCode`).

When linking a domain, the user reviews recommended markets after ownership verification and must select at least one before completing direct-domain onboarding. Each market is requested separately through DataForSEO Labs; the user can change the selection before saving and later from the linked-domain detail page.

## Keyword research workflow

On **Keyword research**:

1. Choose a market in the locale selector.
2. Enter a seed keyword and expand ideas. Hyperlocalise calls DataForSEO Labs through the internal `go-svc` service (default 50 ideas, up to 200).
3. Open a SERP snapshot for any idea to inspect live organic results.
4. Save keywords you want to track or revisit. Saved keywords persist per domain and market.

Saved keywords and rank snapshots survive reloads. Ephemeral expand and SERP preview state lives only until you navigate away.

## Rank tracking

On **Rank tracking**:

1. Select keywords to track for the current market (up to **20** keywords per refresh request).
2. Run a refresh to fetch live positions for your verified hostname.
3. Historical snapshots are stored for each tracked keyword.

Rank checks use DataForSEO live SERP data. Batch refreshes process keywords in groups of 20 per market.

## Operator setup

Domains research is optional infrastructure. Segment validation in `go-svc` works without it.

### Web app

The Next.js app proxies research to `go-svc` over `GO_SVC_URL`. It does **not** read `DATAFORSEO_API_KEY` directly. The browser never sees the research service token.

| Variable | Role |
| --- | --- |
| `GO_SVC_URL` | Origin for server-side research calls (Vercel service binding in production) |
| `WORKOS_COOKIE_PASSWORD` | Signs the `X-Go-Svc-Research-Token` header (must match `go-svc`) |
| `DATABASE_URL` | Postgres for linked domains and research tables |

### go-svc

Set these on the `go_svc` Vercel service (see [`apps/go-svc/README.md`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/go-svc/README.md)):

| Variable | Role |
| --- | --- |
| `DATAFORSEO_API_KEY` | Base64-encoded `email:api_password` from [DataForSEO API Access](https://app.dataforseo.com/api-access) |
| `WORKOS_COOKIE_PASSWORD` | Session cookies and research token validation |
| `WORKOS_API_KEY`, `WORKOS_CLIENT_ID` | Session refresh |

Without `DATAFORSEO_API_KEY`, research mutations return `provider_not_configured` or `dataforseo_not_configured`.

Research routes require both a signed-in WorkOS session cookie and the server-only `X-Go-Svc-Research-Token` header. Only the web app should call them.

## API (organization scope)

Authenticated org routes live under `/api/orgs/{organizationSlug}/linked-domains`. All routes require the `workspace-domains` flag.

### Linked domains

| Method | Path | Capability | Description |
| --- | --- | --- | --- |
| `GET` | `/linked-domains` | `projects:read` | List linked domains |
| `POST` | `/linked-domains` | `projects:create` | Start a claim (`{ domainSlug }`) |
| `GET` | `/linked-domains/{id}` | `projects:read` | Fetch one domain |
| `GET` | `/linked-domains/{id}/audit` | `projects:read` | Localization audit snapshot |
| `POST` | `/linked-domains/{id}/verify` | `projects:create` | Run verification |
| `POST` | `/linked-domains/{id}/market-recommendations` | `projects:write` | Recommend markets after verification; one DataForSEO request per market |
| `PATCH` | `/linked-domains/{id}/markets` | `projects:write` | Save the user’s selected market IDs after verification |
| `DELETE` | `/linked-domains/{id}` | `projects:create` | Cancel a pending claim |

### Research

Nested under `/linked-domains/{id}/research`:

| Method | Path | Capability | Description |
| --- | --- | --- | --- |
| `GET` | `/research` | read | Catalog and domain metadata |
| `POST` | `/research/keywords/expand` | write | Expand a seed keyword (`seedKeyword`, `marketId`) |
| `POST` | `/research/keywords/save` | write | Persist keyword ideas (max 100) |
| `POST` | `/research/serp` | read | Live SERP snapshot |
| `POST` | `/research/ranks` | write | Track keywords (max 20) |
| `POST` | `/research/ranks/refresh` | write | Refresh tracked ranks |

Common error codes: `linked_domain_not_found`, `market_not_found`, `provider_not_configured`, `provider_unavailable`, `provider_rate_limited`.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| **Domains** missing from sidebar | `workspace-domains` flag disabled for the org |
| Research actions blocked | Domain still `pending_verification` |
| `provider_not_configured` | `DATAFORSEO_API_KEY` unset on `go-svc` |
| `provider_rate_limited` | DataForSEO quota or rate limit hit |
| Empty AI visibility or prompts | Live domains return stubs; only Storybook prototype IDs ship fixture data |
| Another org owns the hostname | A verified claim already exists for that `domainKey` |

## Next

- [Integrations](/platform/integrations)
- [Automations](/platform/automations)
- [Public API](/platform/api)
