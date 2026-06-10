import {
  isArgumentElement,
  isDateElement,
  isNumberElement,
  isPluralElement,
  isPoundElement,
  isSelectElement,
  isTagElement,
  isTimeElement,
  parse,
  type Location,
  type MessageFormatElement,
  type PluralElement,
  type SelectElement,
} from "@formatjs/icu-messageformat-parser";

export type CatMessageTokenKind = "argument" | "icu" | "number" | "date" | "time" | "pound" | "tag";

export interface CatMessageToken {
  id: string;
  kind: CatMessageTokenKind;
  name: string;
  literal: string;
  start: number;
  end: number;
  options?: string[];
  type?: "plural" | "select" | "selectordinal";
}

export interface CatIcuBlockSummary {
  id: string;
  arg: string;
  type: "plural" | "select" | "selectordinal";
  options: string[];
}

export interface CatMessageAnalysis {
  message: string;
  tokens: CatMessageToken[];
  placeholders: CatMessageToken[];
  icuBlocks: CatIcuBlockSummary[];
  parseError?: {
    message: string;
    start: number;
    end: number;
  };
}

export interface CatMessageParityIssue {
  kind: "missing-token" | "extra-token" | "icu-mismatch" | "parse-error";
  label: string;
  message: string;
  tokens?: string[];
}

function locationRange(location: Location | undefined, fallbackEnd: number) {
  return {
    start: location?.start.offset ?? 0,
    end: location?.end.offset ?? fallbackEnd,
  };
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((first, second) => first.localeCompare(second));
}

function elementType(element: PluralElement | SelectElement): CatMessageToken["type"] {
  if (isPluralElement(element)) {
    return element.pluralType === "ordinal" ? "selectordinal" : "plural";
  }

  return "select";
}

function pushToken(
  tokens: CatMessageToken[],
  message: string,
  element: MessageFormatElement,
  index: number,
) {
  if (isArgumentElement(element)) {
    const range = locationRange(element.location, message.length);
    tokens.push({
      id: `argument-${element.value}-${range.start}-${index}`,
      kind: "argument",
      name: element.value,
      literal: message.slice(range.start, range.end),
      ...range,
    });
    return;
  }

  if (isNumberElement(element) || isDateElement(element) || isTimeElement(element)) {
    const range = locationRange(element.location, message.length);
    const kind = isNumberElement(element) ? "number" : isDateElement(element) ? "date" : "time";
    tokens.push({
      id: `${kind}-${element.value}-${range.start}-${index}`,
      kind,
      name: element.value,
      literal: message.slice(range.start, range.end),
      ...range,
    });
    return;
  }

  if (isPluralElement(element) || isSelectElement(element)) {
    const range = locationRange(element.location, message.length);
    const type = elementType(element);
    tokens.push({
      id: `${type}-${element.value}-${range.start}-${index}`,
      kind: "icu",
      name: element.value,
      literal: message.slice(range.start, range.end),
      options: uniqueSorted(Object.keys(element.options)),
      type,
      ...range,
    });
    return;
  }

  if (isPoundElement(element)) {
    const range = locationRange(element.location, message.length);
    tokens.push({
      id: `pound-${range.start}-${index}`,
      kind: "pound",
      name: "#",
      literal: message.slice(range.start, range.end) || "#",
      ...range,
    });
    return;
  }

  if (isTagElement(element)) {
    const range = locationRange(element.location, message.length);
    tokens.push({
      id: `tag-${element.value}-${range.start}-${index}`,
      kind: "tag",
      name: element.value,
      literal: message.slice(range.start, range.end),
      ...range,
    });
  }
}

function walkElements(
  elements: MessageFormatElement[],
  message: string,
  tokens: CatMessageToken[],
  startIndex = 0,
) {
  elements.forEach((element, index) => {
    const tokenIndex = startIndex + index;
    pushToken(tokens, message, element, tokenIndex);

    if (isPluralElement(element) || isSelectElement(element)) {
      Object.values(element.options).forEach((option) => {
        walkElements(option.value, message, tokens, tokens.length);
      });
    }

    if (isTagElement(element)) {
      walkElements(element.children, message, tokens, tokens.length);
    }
  });
}

export function analyzeCatMessageFormat(message: string): CatMessageAnalysis {
  try {
    const ast = parse(message, {
      captureLocation: true,
      ignoreTag: false,
      requiresOtherClause: true,
    });
    const tokens: CatMessageToken[] = [];
    walkElements(ast, message, tokens);
    const placeholders = tokens.filter((token) =>
      ["argument", "number", "date", "time", "tag"].includes(token.kind),
    );
    const icuBlocks = tokens
      .filter((token) => token.kind === "icu" && token.type)
      .map((token) => ({
        id: token.id,
        arg: token.name,
        type: token.type!,
        options: token.options ?? [],
      }));

    return {
      message,
      tokens,
      placeholders,
      icuBlocks,
    };
  } catch (error) {
    const parserError = error as {
      message?: string;
      location?: Location;
    };
    const range = locationRange(parserError.location, Math.max(message.length, 1));

    return {
      message,
      tokens: [],
      placeholders: [],
      icuBlocks: [],
      parseError: {
        message: parserError.message ?? "Message syntax could not be parsed.",
        start: range.start,
        end: Math.max(range.end, range.start + 1),
      },
    };
  }
}

function tokenSignature(token: CatMessageToken) {
  if (token.kind === "icu") {
    return `${token.kind}:${token.name}:${token.type}`;
  }

  return `${token.kind}:${token.name}`;
}

function tokenDisplayName(token: CatMessageToken) {
  if (token.kind === "icu") {
    return `{${token.name}, ${token.type}}`;
  }

  if (token.kind === "tag") {
    return `<${token.name}>`;
  }

  return `{${token.name}}`;
}

function findMissingTokens(sourceTokens: CatMessageToken[], targetTokens: CatMessageToken[]) {
  const targetSignatures = new Set(targetTokens.map(tokenSignature));
  return sourceTokens.filter((token) => !targetSignatures.has(tokenSignature(token)));
}

export function compareCatMessageFormats(
  source: CatMessageAnalysis,
  target: CatMessageAnalysis,
): CatMessageParityIssue[] {
  const issues: CatMessageParityIssue[] = [];

  if (source.parseError) {
    issues.push({
      kind: "parse-error",
      label: "Source message syntax",
      message: source.parseError.message,
    });
  }

  if (target.parseError) {
    issues.push({
      kind: "parse-error",
      label: "Target message syntax",
      message: target.parseError.message,
    });
    return issues;
  }

  if (source.parseError) {
    return issues;
  }

  const missingPlaceholders = findMissingTokens(source.placeholders, target.placeholders);
  if (missingPlaceholders.length > 0) {
    const labels = uniqueSorted(missingPlaceholders.map(tokenDisplayName));
    issues.push({
      kind: "missing-token",
      label: "Missing placeholders",
      message: `Target is missing ${labels.join(", ")} from the source string.`,
      tokens: labels,
    });
  }

  const extraPlaceholders = findMissingTokens(target.placeholders, source.placeholders);
  if (extraPlaceholders.length > 0) {
    const labels = uniqueSorted(extraPlaceholders.map(tokenDisplayName));
    issues.push({
      kind: "extra-token",
      label: "Extra placeholders",
      message: `Target includes ${labels.join(", ")} that is not in the source string.`,
      tokens: labels,
    });
  }

  const missingIcuBlocks = findMissingTokens(
    source.tokens.filter((token) => token.kind === "icu"),
    target.tokens.filter((token) => token.kind === "icu"),
  );
  if (missingIcuBlocks.length > 0) {
    const labels = uniqueSorted(missingIcuBlocks.map(tokenDisplayName));
    issues.push({
      kind: "icu-mismatch",
      label: "ICU structure",
      message: `Target ICU structure must match ${labels.join(", ")} from the source string.`,
      tokens: labels,
    });
  }

  return issues;
}

export function missingCatMessageTokens(sourceMessage: string, targetMessage: string) {
  const source = analyzeCatMessageFormat(sourceMessage);
  const target = analyzeCatMessageFormat(targetMessage);
  if (source.parseError || target.parseError) {
    return [];
  }

  return findMissingTokens(source.tokens, target.tokens).filter((token) => token.kind !== "pound");
}
