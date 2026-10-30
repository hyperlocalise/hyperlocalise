# Hyperlocalise HubSpot app

HubSpot developer project for the marketplace OAuth app that WorkOS Pipes uses. Connect still happens from **Integrations** in Hyperlocalise. The token is not stored here.

Platform version `2026.09`. Project name `hl-hubspot`. App uid `hl_hubspot_app`.

## Auth

OAuth redirect:

`https://api.workos.com/data-integrations/hubspot/8zTSkHjMsVuTc0gYgn9lrLqzp/callback`

Required scopes: `oauth`, `content`, `forms`, `automation.email_templates.read`, `automation.email_templates.write`.

`content` covers marketing emails, blog posts, landing pages, and website pages. `forms` covers forms. The automation scopes cover CRM message templates.

## Upload

Install the [HubSpot CLI](https://developers.hubspot.com/docs/developer-tooling/local-development/hubspot-cli/install-the-cli), authenticate an account, then from this directory:

```bash
cd apps/hubspot-app
hs account auth
hs project upload
```

`hubspot.config.yml` stays on your machine. Do not commit it.

Replace `support.supportPhone` in `src/app/app-hsmeta.json` before a marketplace listing. The current number is a placeholder.
