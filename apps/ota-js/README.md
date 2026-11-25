# @hyperlocalise/ota

Over-the-air translations for JavaScript apps. It loads the approved strings
from a Hyperlocalise [CDN distribution](https://docs.hyperlocalise.com/platform/developers/cdn-distributions),
so copy changes reach users without shipping a new build.

- Works with any i18n library: react-intl, next-intl, i18next, vue-i18n, svelte-i18n, or your own.
- No dependencies. Runs in browsers, Node 18+, React Native, Deno, Bun and edge runtimes.
- Keeps the last release in storage and uses it when the app starts offline.
- Uses your bundled strings when OTA is unreachable or the hash is revoked.

## Install

```bash
npm install @hyperlocalise/ota
```

## Usage

The SDK returns plain message objects. Your library formats them.

```ts
import { createOtaClient } from "@hyperlocalise/ota";
import fr from "./locales/fr-FR.json";

const ota = createOtaClient({
  hash: "50fb350641274ba88296f97dc7e3e0c3",
  fallbackMessages: { "fr-FR": fr },
});

// 1. Load and give the messages to your library.
setMessages("fr-FR", await ota.getMessages("fr-FR"));

// 2. Do it again when a new release goes out.
ota.subscribe(async () => setMessages("fr-FR", await ota.getMessages("fr-FR")));
ota.startPolling();
```

`getMessages` merges every file in the distribution for that locale and returns
flat keys, with the text as written in your source files. Pass
`{ namespace: "checkout" }` for only `/checkout.json`. Locales resolve loosely:
`fr`, `fr_FR` and `fr-CA` all find `fr-FR`.

For libraries that look keys up by path, nest them:

```ts
import { unflattenMessages } from "@hyperlocalise/ota";

unflattenMessages({ "checkout.title": "Paiement" }); // { checkout: { title: "Paiement" } }
```

| Library                          | Pass                                                                    |
| -------------------------------- | ----------------------------------------------------------------------- |
| react-intl / FormatJS            | `messages`                                                              |
| i18next                          | `messages` with `keySeparator: false`, or `unflattenMessages(messages)` |
| next-intl, vue-i18n, svelte-i18n | `unflattenMessages(messages)`                                           |

The [JavaScript OTA SDK guide](https://docs.hyperlocalise.com/platform/developers/ota-javascript-sdk)
has a full recipe for each library.

### React Native

Pass AsyncStorage so the last release survives restarts:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const ota = createOtaClient({ hash, storage: AsyncStorage });
```

### Custom S3 destination

```ts
createOtaClient({ hash, baseUrl: "https://cdn.example.com" });
```

## Options

| Option             | Default                                    |                                                                                     |
| ------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `hash`             | required                                   | The distribution's public hash.                                                     |
| `baseUrl`          | `https://public-api.hyperlocalise.com/ota` | URL in front of the hash.                                                           |
| `fallbackBaseUrls` | `https://api.hyperlocalise.com/ota`        | Tried on network errors and 5xx. None when `baseUrl` is set.                        |
| `storage`          | `localStorage`, else memory                | Any `getItem`/`setItem`/`removeItem` store, sync or async.                          |
| `pollIntervalMs`   | 15 minutes                                 | How long a manifest is reused, and the polling interval. The minimum is 15 minutes. |
| `timeoutMs`        | 10 seconds                                 | Per request.                                                                        |
| `fallbackMessages` | `{}`                                       | Bundled strings by locale.                                                          |
| `onError`          |                                            | Called for errors the client recovers from.                                         |
| `fetch`            | `globalThis.fetch`                         |                                                                                     |

## Errors

Methods reject with `OtaError` only when nothing can be served. `code` is one of
`not_found`, `http_error`, `network_error`, `timeout`, `invalid_manifest`,
`invalid_content`, `unsupported_format` or `unknown_locale`.

Distributions in the `android-xml` or `ios-strings` format work with
`getContent(locale)`, which returns each file's raw body.

## Development

```bash
vp install
vp test
vp check --fix
vp pack
```
