export type IcuBlockSignature = {
  arg: string;
  type: "plural" | "select" | "selectordinal";
  options: string[];
};

export type TextInvariant = {
  placeholders: string[];
  icuBlocks: IcuBlockSignature[];
  parseError?: string;
};

const placeholderNamePattern = /^[A-Za-z_$][\w.$-]*$/;

function isPlaceholderName(value: string) {
  return placeholderNamePattern.test(value);
}

function normalizeMustachePlaceholders(text: string) {
  let output = "";
  for (let index = 0; index < text.length; ) {
    if (text[index] === "{" && text[index + 1] === "{") {
      let end = index + 2;
      while (end < text.length && !(text[end] === "}" && text[end + 1] === "}")) {
        end += 1;
      }
      if (end + 1 < text.length && text[end] === "}" && text[end + 1] === "}") {
        const name = text.slice(index + 2, end).trim();
        if (isPlaceholderName(name)) {
          output += `{${name}}`;
          index = end + 2;
          continue;
        }
      }
    }
    output += text[index];
    index += 1;
  }
  return output;
}

function findMatchingBraceEnd(text: string, openIndex: number) {
  let depth = 0;
  let quote: "'" | '"' | null = null;

  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote && text[index - 1] !== "\\") {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function parsePluralOrSelectHeader(header: string): IcuBlockSignature | null {
  const parts = header.split(",").map((part) => part.trim());
  if (parts.length < 2) {
    return null;
  }

  const arg = parts[0];
  const typeToken = parts[1].toLowerCase();
  if (!isPlaceholderName(arg)) {
    return null;
  }

  let type: IcuBlockSignature["type"] | null = null;
  if (typeToken === "plural") {
    type = "plural";
  } else if (typeToken === "select") {
    type = "select";
  } else if (typeToken === "selectordinal") {
    type = "selectordinal";
  }

  if (!type) {
    return null;
  }

  return { arg, type, options: [] };
}

function collectOptionSelectors(optionSection: string, block: IcuBlockSignature) {
  let index = 0;

  while (index < optionSection.length) {
    while (index < optionSection.length && /\s/.test(optionSection[index])) {
      index += 1;
    }
    if (index >= optionSection.length) {
      break;
    }

    let selectorEnd = index;
    while (
      selectorEnd < optionSection.length &&
      !/\s/.test(optionSection[selectorEnd]) &&
      optionSection[selectorEnd] !== "{"
    ) {
      selectorEnd += 1;
    }

    const selector = optionSection.slice(index, selectorEnd).trim();
    if (selector) {
      block.options.push(selector);
    }

    while (index < optionSection.length && optionSection[index] !== "{") {
      index += 1;
    }
    if (index >= optionSection.length) {
      break;
    }

    const bodyEnd = findMatchingBraceEnd(optionSection, index);
    if (bodyEnd < 0) {
      break;
    }

    index = bodyEnd + 1;
  }

  block.options.sort();
}

export function parseTextInvariant(text: string): TextInvariant {
  const normalized = normalizeMustachePlaceholders(text);
  const invariant: TextInvariant = { placeholders: [], icuBlocks: [] };

  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] !== "{") {
      continue;
    }

    const end = findMatchingBraceEnd(normalized, index);
    if (end < 0) {
      invariant.parseError = "unbalanced braces";
      break;
    }

    const inner = normalized.slice(index + 1, end).trim();
    if (!inner) {
      invariant.parseError = "empty placeholder";
      break;
    }

    if (inner.includes(",")) {
      const block = parsePluralOrSelectHeader(inner);
      if (!block) {
        invariant.parseError = "invalid ICU block header";
        break;
      }
      const firstComma = inner.indexOf(",");
      const secondComma = inner.indexOf(",", firstComma + 1);
      const optionSection = secondComma >= 0 ? inner.slice(secondComma + 1) : "";
      collectOptionSelectors(optionSection, block);
      invariant.icuBlocks.push(block);
      invariant.placeholders.push(block.arg);
      index = end;
      continue;
    }

    if (isPlaceholderName(inner)) {
      invariant.placeholders.push(inner);
    }

    index = end;
  }

  invariant.placeholders = [...new Set(invariant.placeholders)].sort();
  invariant.icuBlocks.sort((left, right) => {
    if (left.arg !== right.arg) {
      return left.arg.localeCompare(right.arg);
    }
    if (left.type !== right.type) {
      return left.type.localeCompare(right.type);
    }
    return left.options.join(",").localeCompare(right.options.join(","));
  });

  return invariant;
}

export function samePlaceholderSet(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export function sameIcuBlocks(left: IcuBlockSignature[], right: IcuBlockSignature[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a.arg !== b.arg || a.type !== b.type || a.options.join(",") !== b.options.join(",")) {
      return false;
    }
  }

  return true;
}

export function formatIcuBlocks(blocks: IcuBlockSignature[]) {
  if (blocks.length === 0) {
    return "[]";
  }

  return `[${blocks
    .map((block) => `${block.arg}:${block.type}[${block.options.join(" ")}]`)
    .join(", ")}]`;
}
