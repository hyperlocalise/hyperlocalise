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

**In JSX** — use `<FormattedMessage />`:

```tsx
import { FormattedMessage } from 'react-intl';

<Button>
  <FormattedMessage
    defaultMessage="Save changes"
    description="Primary action to persist edits"
  />
</Button>;
```

**Outside JSX** (toasts, `aria-label`, object fields) — use `useIntl()`:

```tsx
import { useIntl } from 'react-intl';

const intl = useIntl();

toast({
  title: intl.formatMessage({
    defaultMessage: 'Saved successfully',
    description: 'Toast after successful save',
  }),
});
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

### 4. Authoring rules (must follow)

- Write a clear **English `defaultMessage`** and a **`description`** when it helps translators.
- **Do not hand-write `id`.** Omit `id` initially or use a placeholder; run **`npx eslint <path> --fix`** so `eslint-plugin-formatjs` (`enforce-id`) sets the content hash. Re-run until clean.
- **Prefer typographic quotes** in copy (`’` `“` `”`) per localization.md — not straight quotes in user-visible English, except where ICU escaping needs straight quotes. **Never** fake curly quotes with Unicode escapes (`\u2019`, etc.) — they hurt readability and can change the content hash.
- **One complete sentence per message** — do not split a sentence across multiple `FormattedMessage` calls.
- Prefer **separate messages** for distinct UI slots over a single `select` when variants are not one grammatical sentence.

### 6. Locale files — do not edit manually

Colocate strings in code via `defaultMessage` / `formatMessage`; IDs are enforced by ESLint.

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

- JSX: `<FormattedMessage />` with ICU where needed
- Non-JSX: `useIntl().formatMessage`
- ESLint `--fix` applied for formatjs message IDs

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
import { FormattedMessage } from 'react-intl';

export function DeleteButton() {
  return (
    <Button variant="destructive">
      <FormattedMessage
        defaultMessage="Delete"
        description="Destructive action to remove an item"
      />
    </Button>
  );
}
```

### Toast (non-JSX)

**Before:**

```tsx
toast({ variant: 'success', title: 'Item deleted successfully' });
```

**After:**

```tsx
import { useIntl } from 'react-intl';

const intl = useIntl();

toast({
  variant: 'success',
  title: intl.formatMessage({
    defaultMessage: 'Item deleted successfully',
    description: 'Toast after deleting an item',
  }),
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

When you need to **reuse** the same copy across several components in a feature, or **structure** messages (for example labels keyed by an enum or category id), use a colocated **`*.messages.ts`** file next to the components that consume it — still within the feature or design-system slice, not a repo-wide “strings” barrel.

- Name the file **`{featureOrComponent}.messages.ts`** (for example `calculatorCategory.messages.ts`).
- Export descriptors with **`defineMessages`** from `react-intl` and a single exported object (for example `export const calculatorCategoryMessages = defineMessages({ ... })`).
- Use **stable object keys** (for example `basic_measurements`, `saveButton`) as the internal identifiers; translators work from `defaultMessage` and `description`.
- At call sites: `intl.formatMessage(myMessages.someKey)` or `<FormattedMessage {...myMessages.someKey} values={{ ... }} />` when placeholders are needed.
