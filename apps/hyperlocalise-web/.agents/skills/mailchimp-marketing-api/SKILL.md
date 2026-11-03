---
name: mailchimp-marketing-api
description: Integrate Mailchimp Marketing API 3.0 via REST (fetch), not the TypeScript SDK. Use for campaigns, templates, ping, and pagination in hyperlocalise-web.
---

# Mailchimp Marketing API (REST)

Hyperlocalise talks to Mailchimp through the **Marketing API 3.0** over HTTPS with `fetch`, not `@mailchimp/mailchimp-marketing`.

## Official docs

- Index for agents: [https://mailchimp.com/developer/llms.txt](https://mailchimp.com/developer/llms.txt)
- API reference: [https://mailchimp.com/developer/marketing/api](https://mailchimp.com/developer/marketing/api)
- Markdown for any endpoint: append `.md` to the doc URL (see llms.txt)

## Auth and base URL

- API keys end with `-{dc}` (datacenter). Base URL: `https://{dc}.api.mailchimp.com/3.0`
- HTTP Basic: username `anystring`, password = full API key (or `Authorization: Basic base64(anystring:apikey)`)
- Health check: `GET /ping`

## Implementation in this repo

- Client adapter: `apps/hyperlocalise-web/src/lib/mailchimp/client.ts`
- Credentials ping: `apps/hyperlocalise-web/src/lib/mailchimp/ping.ts`
- v1 scope: regular **campaigns** and **user templates** only (no audiences, journeys, or send/schedule actions on push)

## Endpoints we use

| Operation            | Method | Path                                              |
| -------------------- | ------ | ------------------------------------------------- |
| Ping                 | GET    | `/ping`                                           |
| List campaigns       | GET    | `/campaigns?type=regular&status=…&count=&offset=` |
| Get campaign         | GET    | `/campaigns/{campaign_id}`                        |
| Campaign content     | GET    | `/campaigns/{campaign_id}/content`                |
| Create campaign      | POST   | `/campaigns`                                      |
| Set campaign content | PUT    | `/campaigns/{campaign_id}/content`                |
| List templates       | GET    | `/templates?type=user&count=&offset=`             |
| Get template         | GET    | `/templates/{template_id}`                        |
| Create template      | POST   | `/templates`                                      |
| Update template      | PATCH  | `/templates/{template_id}`                        |

Request and response bodies use **snake_case** JSON as in the API reference.

## Pagination

List endpoints return `total_items` and a `campaigns` or `templates` array. Paginate with `count` (max 1000) and `offset` until a page returns fewer than `count` items.

## Errors

- `401` / `403`: invalid or revoked API key
- Other non-2xx: treat as transient unless the body indicates a client error

Do not add the Mailchimp TypeScript SDK or `.vendor/mailchimp-marketing` unless product explicitly requires it.
