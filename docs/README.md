# Hyperlocalise Docs

This directory contains the Mintlify documentation site for Hyperlocalise. The
site covers Hyperlocalise Cloud and the CLI, plus contributor guides.

## Structure

- `docs.json`: Mintlify site configuration and navigation
- `index.mdx`: Cloud landing page
- `platform/`: Cloud guides
- `cli/`: CLI, configuration, commands, providers, and TMS adapters
- `contributing/`: contributor and maintainer documentation
- `zh-CN/` and `vi-VN/`: localized documentation with the same folders

Do not edit localized docs under `zh-CN/` or `vi-VN/` unless the change is
explicitly for those locales.

## Local Preview

Install the Mintlify CLI:

```bash
npm i -g mint
```

Run the preview server from this `docs` directory, where `docs.json` lives:

```bash
mint dev
```

The local preview runs at `http://localhost:3000`.

## Checks

Check links before publishing larger documentation changes:

```bash
mint broken-links
```

If the local preview behaves unexpectedly, update the CLI:

```bash
mint update
```

## Publishing

Mintlify deploys the documentation from the repository after changes land on the
configured default branch. Keep navigation updates in `docs.json` together with
the pages they add or remove.

## AI-Assisted Writing

Mintlify provides an optional documentation skill for AI coding tools:

```bash
npx skills add https://mintlify.com/docs
```

Use it for Mintlify component references, writing standards, and docs workflow
guidance when it is available in your environment.
