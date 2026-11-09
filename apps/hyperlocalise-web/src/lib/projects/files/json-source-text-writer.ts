/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */

/** A string value in the file: its flattened key, its text and where its literal sits. */
type StringSlot = { key: string; text: string; start: number; end: number };

type Parsed = { slots: StringSlot[]; catalog: boolean };

export type JsonSourceTextOutcome =
  | { kind: "file"; content: Buffer; written: string[] }
  | { kind: "unchanged" }
  /** Not JSON (or JSONC) the writer can read. */
  | { kind: "unreadable" };

/**
 * Writes new source text into a JSON, JSONC or ARB file in place: only the string literals of
 * the given keys change, so the file's layout, comments, escapes, key order and empty containers
 * stay as they were. Keys are flattened the way the JSON importer flattens them (`a.b`, `a[0]`;
 * a FormatJS catalog by message id, for its `defaultMessage`), trimmed as the importer trims them. `shouldWrite` can hold back a key
 * given the text the file has for it.
 */
export function writeJsonSourceText(
  content: Buffer,
  texts: Record<string, string>,
  shouldWrite: (key: string, fileText: string) => boolean = () => true,
): JsonSourceTextOutcome {
  const source = content.toString("utf8");
  const parsed = parseSlots(source);
  if (!parsed) {
    return { kind: "unreadable" };
  }
  const edits = parsed.slots
    .filter(
      (slot) =>
        Object.hasOwn(texts, slot.key) &&
        texts[slot.key] !== slot.text &&
        shouldWrite(slot.key, slot.text),
    )
    .sort((a, b) => a.start - b.start);
  if (edits.length === 0) {
    return { kind: "unchanged" };
  }
  let out = "";
  let cursor = 0;
  for (const edit of edits) {
    out += source.slice(cursor, edit.start) + JSON.stringify(texts[edit.key]);
    cursor = edit.end;
  }
  out += source.slice(cursor);
  return {
    kind: "file",
    content: Buffer.from(out, "utf8"),
    written: edits.map((edit) => edit.key),
  };
}

type Value =
  | { kind: "string"; text: string; start: number; end: number }
  | { kind: "object"; entries: [string, Value][] }
  | { kind: "array"; items: Value[] }
  | { kind: "other" };

function parseSlots(source: string): Parsed | null {
  let root: Value;
  try {
    const parser = new Parser(source);
    root = parser.document();
  } catch {
    return null;
  }
  if (root.kind !== "object") {
    return null;
  }
  const catalog =
    root.entries.length > 0 &&
    root.entries.every(
      ([, value]) =>
        value.kind === "object" &&
        value.entries.some(([name, child]) => name === "defaultMessage" && child.kind === "string"),
    );
  const slots: StringSlot[] = [];
  if (catalog) {
    for (const [id, value] of root.entries) {
      if (value.kind !== "object") continue;
      const message = value.entries.find(([name]) => name === "defaultMessage")?.[1];
      if (message?.kind === "string") {
        slots.push({ key: id.trim(), text: message.text, start: message.start, end: message.end });
      }
    }
    return { slots, catalog };
  }
  const walk = (value: Value, prefix: string) => {
    if (value.kind === "string") {
      slots.push({ key: prefix.trim(), text: value.text, start: value.start, end: value.end });
    } else if (value.kind === "array") {
      value.items.forEach((item, index) => walk(item, `${prefix}[${index}]`));
    } else if (value.kind === "object") {
      for (const [name, child] of value.entries) {
        walk(child, prefix ? `${prefix}.${name}` : name);
      }
    }
  };
  walk(root, "");
  return { slots, catalog };
}

/** A JSON reader that also takes JSONC: comments and trailing commas. */
class Parser {
  private index = 0;

  constructor(private readonly source: string) {
    if (source.charCodeAt(0) === 0xfeff) {
      this.index = 1;
    }
  }

  document(): Value {
    const value = this.value();
    this.skip();
    if (this.index !== this.source.length) {
      throw new Error("trailing content");
    }
    return value;
  }

  private value(): Value {
    this.skip();
    const char = this.source[this.index];
    if (char === "{") return this.object();
    if (char === "[") return this.array();
    if (char === '"') {
      const start = this.index;
      const text = this.string();
      return { kind: "string", text, start, end: this.index };
    }
    const match = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(
      this.source.slice(this.index, this.index + 64),
    );
    if (!match) {
      throw new Error("unexpected token");
    }
    this.index += match[0].length;
    return { kind: "other" };
  }

  private object(): Value {
    this.index += 1;
    const entries: [string, Value][] = [];
    for (;;) {
      this.skip();
      if (this.source[this.index] === "}") {
        this.index += 1;
        return { kind: "object", entries };
      }
      if (this.source[this.index] !== '"') {
        throw new Error("expected a key");
      }
      const name = this.string();
      this.skip();
      if (this.source[this.index] !== ":") {
        throw new Error("expected a colon");
      }
      this.index += 1;
      entries.push([name, this.value()]);
      this.skip();
      if (this.source[this.index] === ",") {
        this.index += 1;
      } else if (this.source[this.index] !== "}") {
        throw new Error("expected a comma");
      }
    }
  }

  private array(): Value {
    this.index += 1;
    const items: Value[] = [];
    for (;;) {
      this.skip();
      if (this.source[this.index] === "]") {
        this.index += 1;
        return { kind: "array", items };
      }
      items.push(this.value());
      this.skip();
      if (this.source[this.index] === ",") {
        this.index += 1;
      } else if (this.source[this.index] !== "]") {
        throw new Error("expected a comma");
      }
    }
  }

  private string(): string {
    const start = this.index;
    this.index += 1;
    for (;;) {
      const char = this.source[this.index];
      if (char === undefined || char === "\n") {
        throw new Error("unterminated string");
      }
      if (char === "\\") {
        this.index += 2;
        continue;
      }
      this.index += 1;
      if (char === '"') {
        return JSON.parse(this.source.slice(start, this.index)) as string;
      }
    }
  }

  private skip() {
    for (;;) {
      const char = this.source[this.index];
      if (char === " " || char === "\t" || char === "\n" || char === "\r") {
        this.index += 1;
      } else if (char === "/" && this.source[this.index + 1] === "/") {
        const end = this.source.indexOf("\n", this.index);
        this.index = end === -1 ? this.source.length : end;
      } else if (char === "/" && this.source[this.index + 1] === "*") {
        const end = this.source.indexOf("*/", this.index + 2);
        if (end === -1) throw new Error("unterminated comment");
        this.index = end + 2;
      } else {
        return;
      }
    }
  }
}
