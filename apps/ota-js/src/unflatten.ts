import type { OtaMessages } from "./manifest";

export interface NestedMessages {
  [key: string]: string | NestedMessages;
}

/**
 * Turns flat keys into nested objects for libraries that look keys up by path
 * (next-intl, vue-i18n, i18next with its default `keySeparator`):
 * `{ "checkout.title": "Pay" }` → `{ checkout: { title: "Pay" } }`.
 *
 * A key that would overwrite text, such as `a.b` when `a` is already a
 * string, keeps its full flat name where the paths meet.
 */
export function unflattenMessages(messages: OtaMessages, separator = "."): NestedMessages {
  const root: NestedMessages = {};
  // Sorted so `a` is placed before `a.b`, which makes collisions deterministic.
  for (const key of Object.keys(messages).sort()) {
    const text = messages[key] as string;
    const segments = key.split(separator);
    let node = root;
    let index = 0;
    for (; index < segments.length - 1; index += 1) {
      const segment = segments[index] as string;
      const next = node[segment];
      if (next === undefined) {
        const child: NestedMessages = {};
        node[segment] = child;
        node = child;
      } else if (typeof next === "string") {
        break;
      } else {
        node = next;
      }
    }
    const rest = segments.slice(index).join(separator);
    if (node[rest] === undefined) {
      node[rest] = text;
    }
  }
  return root;
}
