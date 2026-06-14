---
description: Localize hardcoded user-facing strings using react-intl (ICU). Optional path to a file or folder; empty uses git diff vs main.
argument-hint: [path/to/file-or-folder]
allowed-tools: Bash(git:*), Bash(npx:*), Read, Write, Edit, Grep, Glob, TodoWrite
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Goal

Identify hardcoded user-facing strings and convert them to **react-intl** with [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/).

**Colocate** messages in the feature that uses them (`<FormattedMessage>` / `formatMessage` at the call site), not in a shared string module.

---

## Execution Steps

### 1. Determine Target Files

**If user provides a path:**

- Use the provided path (file or folder)
- Scan all `.tsx` and `.ts` files in that path

**If no path provided (empty $ARGUMENTS):**

- Get changed files between the user's current branch and `main`:

```bash
# Committed changes only
git diff main...HEAD --name-only -- '*.tsx' '*.ts' | grep -v '__tests__' | grep -v '.test.' | grep -v '.spec.'
```

- If needed, include uncommitted changes:

```bash
git diff main --name-only -- '*.tsx' '*.ts' | grep -v '__tests__' | grep -v '.test.' | grep -v '.spec.'
```

- Focus on components, containers, features, and hooks that surface UI copy or toasts

### 2. Identify Hardcoded Strings

For each target file, scan for:

1. **JSX text content** — button labels, headings, empty states, etc.
2. **Toast / alert copy** — `title`, `description`, and similar
3. **Labels, placeholders, `aria-*`, image `alt`, `title`** — often need `useIntl().formatMessage` when not JSX children
4. **Tooltips and dialog copy**
5. **User-visible errors** (not internal `throw new Error` for developers)
6. **`meta` / page titles** if the scope includes app shell or document head

**Exclude:** debug logs, test copy, comments, enum/API identifiers, URLs, class names.

### 3. Apply react-intl (ICU)

**react-intl v10 splits server and client.** The main `react-intl` entry is `"use client"`. Do **not** import `defineMessages`, or `useIntl` from `react-intl` in Server Components, `generateMetadata`, route handlers, or any module they import.

| Context | Import from | API | Message storage |
|---|---|---|---|
| Server Components, `generateMetadata`, JSON-LD | `@/lib/app-i18n/intl` → `getIntlShape(locale)` | `intl.formatMessage({ defaultMessage, description })` | **Inline** at the call site — no `*.messages.ts` |
| Client Components (`"use client"`) | `react-intl` | `<FormattedMessage />`, `useIntl()` | Colocated `*.messages.ts` with `defineMessages` |
| Client `*.messages.ts` | `react-intl` → `defineMessages` | Exported descriptors for `<FormattedMessage {...messages.key} />` | `"use client"` at top of file |

`getIntlShape` uses `@formatjs/intl` (`createIntl`) and is safe on the server. `I18nProvider` reuses the same helper and passes `intl.messages` into `react-intl`'s `<IntlProvider>`.

**Why this split:** `eslint-plugin-formatjs` (`enforce-id` via `lint.jsPlugins` in `vite.config.ts`) only analyzes message descriptors it can see statically — inline JSX/`formatMessage` objects and `defineMessages({ ... })` calls. Plain objects in `*.messages.ts` (or spread props like `<FormattedMessage {...messages.foo} />`) are invisible to the linter, so IDs are not enforced or auto-fixed.

**In JSX (client only)** — prefer `<FormattedMessage {...messages.key} />` from a `defineMessages` module, or inline descriptors for one-offs:

```tsx
import { FormattedMessage } from 'react-intl';
import { deleteButtonMessages } from './delete-button.messages';

<Button>
  <FormattedMessage {...deleteButtonMessages.label} />
</Button>;
```

**Outside JSX in client components** (toasts, `aria-label`, object fields) — use `useIntl()` with `defineMessages` or an inline descriptor:

```tsx
import { useIntl } from 'react-intl';
import { saveToastMessages } from './save-toast.messages';

const intl = useIntl();

toast({
  title: intl.formatMessage(saveToastMessages.success),
});
```

**Outside JSX on the server** (`generateMetadata`, JSON-LD, server actions that return localized strings) — use `getIntlShape` with **inline** descriptors (do not import `*.messages.ts`):

```tsx
import { getIntlShape } from '@/lib/app-i18n/intl';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const intl = getIntlShape(lang);

  return {
    title: intl.formatMessage({
      defaultMessage: 'Hyperlocalise | Localisation Platform for the Agentic Era',
      description: 'Page title for the marketing homepage',
    }),
  };
}
```

**Dynamic segments** — one message, ICU placeholders (not string concatenation):

```tsx
<FormattedMessage
  defaultMessage="Hello, {name}"
  values={{ name: userName }}
  description="Greeting with user name"
/>
```

**Plurals, select, rich text, dates/numbers** — use the patterns (`{count, plural, …}`, `{role, select, …}`, tag placeholders for links/bold, `{value, date}`, `{value, number}`, etc.).

**Standalone dates/numbers** (not inside a sentence message) — use `intl.formatDate` / `intl.formatNumber` so formatting stays locale-aware.

**ICU escaping** — `{`, `}`, `<`, `>`, and `#` are syntax; to show them literally, wrap in **single quotes** in `defaultMessage` (literal `'` as `''`)

### Message modules (`*.messages.ts`) — client only

Use colocated **`*.messages.ts`** files **only for client components**. Server code must **not** import them — put server copy inline in `intl.formatMessage({ defaultMessage, description })` at the call site.

When a client feature needs to **reuse** copy across components, or **structure** messages (for example labels keyed by an enum or category id), add a colocated **`{featureOrComponent}.messages.ts`** next to the client components that consume it.

- Add **`"use client"`** as the first line of every `*.messages.ts` file.
- Use **`defineMessages`** from `react-intl` — not plain `MessageDescriptor` objects from `@formatjs/intl`.
- Use **stable object keys** (for example `headline`, `joinWaitlist`) as the internal identifiers; translators work from `defaultMessage` and `description`.
- `defineMessages` must be **one level deep** (flat keys). For grouped copy (for example changelog entries), use prefixed keys (`v1813Title`, `v1813Body`) and map them in the component.
- At call sites: `<FormattedMessage {...myMessages.someKey} values={{ ... }} />` or `intl.formatMessage(myMessages.someKey)`.

```ts
'use client';

import { defineMessages } from 'react-intl';

export const heroSectionMessages = defineMessages({
  headline: {
    defaultMessage: 'The localization platform to launch globally in days',
    description: 'Marketing homepage hero headline',
  },
});
```

### 4. Authoring rules (must follow)

- Write a clear **English `defaultMessage`** and a **`description`** when it helps translators.
- **Do not hand-write `id`.** Omit `id` initially; run **`vp check --fix`** (or `vp lint --fix <path>`) so `eslint-plugin-formatjs` (`enforce-id`, via `lint.jsPlugins` in `vite.config.ts`) sets the content hash on `defineMessages`, inline `<FormattedMessage>`, and `intl.formatMessage({ ... })` calls. Re-run until clean.
- **Prefer typographic quotes** in copy (`’` `“` `”`) per localization.md — not straight quotes in user-visible English, except where ICU escaping needs straight quotes. **Never** fake curly quotes with Unicode escapes (`\u2019`, etc.) — they hurt readability and can change the content hash.
- **One complete sentence per message** — do not split a sentence across multiple `FormattedMessage` calls.
- Prefer **separate messages** for distinct UI slots over a single `select` when variants are not one grammatical sentence.

### 6. Locale files — do not edit manually

Colocate strings in code via `defaultMessage` / `formatMessage`; IDs are enforced by `eslint-plugin-formatjs` strict rules in `apps/hyperlocalise-web/vite.config.ts` (`lint.jsPlugins` + `pluginFormatjs.configs.strict.rules`).

Components must render under **`IntlProvider`**. If you introduce UI outside the usual tree (e.g. some portals), confirm it still sits under the provider.

### 7. RTL / layout (when touching styles)

If the change includes spacing or alignment for localized UI, prefer **logical** Tailwind utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start` / `text-end`)

### 8. Output Report

After processing, summarize:

```markdown
## Localization Summary

### Files Modified

- `src/components/example.tsx` — N strings localized

### Approach

- Client JSX: `<FormattedMessage {...messages.key} />` from `defineMessages` modules
- Client non-JSX: `useIntl().formatMessage(messages.key)` from `defineMessages` modules
- Server (`generateMetadata`, JSON-LD): `getIntlShape(locale).formatMessage({ defaultMessage, description })` inline — no `*.messages.ts`
- Client `*.messages.ts`: `"use client"` + `defineMessages` from `react-intl`
- **`vp check --fix`** / **`vp lint --fix`** for formatjs message IDs in `apps/hyperlocalise-web` (Oxlint `jsPlugins`)

### Notes

- [Plurals, rich text, or anything translators should know]
```

---

## Examples

### Simple label (JSX)

**Before:**

```tsx
export function DeleteButton() {
  return <Button variant="destructive">Delete</Button>;
}
```

**After:**

```tsx
'use client';

import { FormattedMessage } from 'react-intl';
import { deleteButtonMessages } from './delete-button.messages';

export function DeleteButton() {
  return (
    <Button variant="destructive">
      <FormattedMessage {...deleteButtonMessages.label} />
    </Button>
  );
}
```

With `delete-button.messages.ts`:

```ts
'use client';

import { defineMessages } from 'react-intl';

export const deleteButtonMessages = defineMessages({
  label: {
    defaultMessage: 'Delete',
    description: 'Destructive action to remove an item',
  },
});
```

### Toast (non-JSX)

**Before:**

```tsx
toast({ variant: 'success', title: 'Item deleted successfully' });
```

**After:**

```tsx
import { useIntl } from 'react-intl';
import { deleteToastMessages } from './delete-toast.messages';

const intl = useIntl();

toast({
  variant: 'success',
  title: intl.formatMessage(deleteToastMessages.success),
});
```

### Placeholder (ICU)

**Before:**

```tsx
<span>Listening for {duration} minutes</span>
```

**After:**

```tsx
<FormattedMessage
  defaultMessage="Listening for {duration} minutes"
  values={{ duration }}
  description="Status while recording or listening"
/>
```

### Message modules (`*.messages.ts`)

Client-only — see step 3 above. Use `"use client"` + `defineMessages` from `react-intl`. Server copy stays inline in `intl.formatMessage({ ... })` at the call site.

- At call sites: `<FormattedMessage {...myMessages.someKey} values={{ ... }} />` or `intl.formatMessage(myMessages.someKey)` when placeholders are needed.
