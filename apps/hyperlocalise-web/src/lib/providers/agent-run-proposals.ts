import { validateGlossaryTermsInTranslation } from "@/workflows/file-translation-job";

export type AgentRunProposalReviewState = "pending" | "accepted" | "rejected";

export type AgentRunProposalWarningKind = "glossary" | "placeholder" | "format" | "confidence";

export type AgentRunProposalWarnings = Partial<Record<AgentRunProposalWarningKind, boolean>>;

export type AgentRunProposalItem = {
  itemId: string;
  externalStringId: string;
  key: string;
  locale: string;
  sourceText: string;
  from: string;
  to: string;
  reviewState: AgentRunProposalReviewState;
  changedFields: string[];
  warnings: AgentRunProposalWarnings;
};

type GlossaryTermConstraint = Parameters<
  typeof validateGlossaryTermsInTranslation
>[0]["terms"][number];

const placeholderPattern = /\{[^}]+\}|%\d*\$?[sdif]|%\([^)]+\)[sdif]|\{\{[^}]+\}\}|%\w+/g;

const htmlTagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;

export function buildAgentRunProposalItemId(input: { externalStringId: string; locale: string }) {
  return `${input.externalStringId}:${input.locale}`;
}

export function extractPlaceholderTokens(text: string) {
  const matches = text.match(placeholderPattern) ?? [];
  return [...new Set(matches)].sort();
}

function extractHtmlTagNames(text: string) {
  const tags: string[] = [];
  for (const match of text.matchAll(htmlTagPattern)) {
    const tag = match[1]?.toLowerCase();
    if (tag) {
      tags.push(tag);
    }
  }
  return tags.sort();
}

function hasGlossaryWarning(input: {
  sourceText: string;
  translatedText: string;
  glossaryTerms: GlossaryTermConstraint[];
}) {
  if (input.glossaryTerms.length === 0) {
    return false;
  }

  return (
    validateGlossaryTermsInTranslation({
      sourceText: input.sourceText,
      translatedText: input.translatedText,
      terms: input.glossaryTerms,
    }).length > 0
  );
}

function hasPlaceholderWarning(sourceText: string, translatedText: string) {
  const sourcePlaceholders = extractPlaceholderTokens(sourceText);
  if (sourcePlaceholders.length === 0) {
    return false;
  }

  const targetPlaceholders = new Set(extractPlaceholderTokens(translatedText));
  return sourcePlaceholders.some((token) => !targetPlaceholders.has(token));
}

function hasFormatWarning(sourceText: string, translatedText: string) {
  const sourceTags = extractHtmlTagNames(sourceText);
  if (sourceTags.length === 0) {
    return false;
  }

  const targetTags = extractHtmlTagNames(translatedText);
  if (sourceTags.length !== targetTags.length) {
    return true;
  }

  return sourceTags.some((tag, index) => tag !== targetTags[index]);
}

function hasConfidenceWarning(sourceText: string, translatedText: string) {
  const sourceLength = sourceText.trim().length;
  const targetLength = translatedText.trim().length;

  if (sourceLength >= 12 && targetLength === 0) {
    return true;
  }

  if (sourceLength === 0) {
    return false;
  }

  const ratio = targetLength / sourceLength;
  return ratio < 0.15 || ratio > 6;
}

export function detectAgentRunProposalWarnings(input: {
  sourceText: string;
  from: string;
  to: string;
  locale: string;
  glossaryTerms?: Array<{
    sourceTerm: string;
    targetTerm: string;
    targetLocale?: string;
    forbidden?: boolean | null;
    caseSensitive?: boolean | null;
  }>;
}): AgentRunProposalWarnings {
  const glossaryTerms: GlossaryTermConstraint[] = (input.glossaryTerms ?? []).map((term) => ({
    sourceTerm: term.sourceTerm,
    targetTerm: term.targetTerm,
    targetLocale: term.targetLocale ?? input.locale,
    forbidden: term.forbidden ?? null,
    caseSensitive: term.caseSensitive ?? null,
  }));
  const warnings: AgentRunProposalWarnings = {};

  if (hasGlossaryWarning({ ...input, translatedText: input.to, glossaryTerms })) {
    warnings.glossary = true;
  }
  if (hasPlaceholderWarning(input.sourceText, input.to)) {
    warnings.placeholder = true;
  }
  if (hasFormatWarning(input.sourceText, input.to)) {
    warnings.format = true;
  }
  if (hasConfidenceWarning(input.sourceText, input.to)) {
    warnings.confidence = true;
  }

  return warnings;
}

export function deriveChangedFields(from: string, to: string) {
  const fields: string[] = [];
  if (from !== to) {
    fields.push("target");
  }
  return fields;
}

export function enrichAgentRunProposalItem(
  raw: Record<string, unknown>,
  glossaryTerms?: Parameters<typeof detectAgentRunProposalWarnings>[0]["glossaryTerms"],
): AgentRunProposalItem | null {
  const externalStringId = typeof raw.externalStringId === "string" ? raw.externalStringId : null;
  const key = typeof raw.key === "string" ? raw.key : null;
  const locale = typeof raw.locale === "string" ? raw.locale : null;
  const sourceText = typeof raw.sourceText === "string" ? raw.sourceText : "";
  const from = typeof raw.from === "string" ? raw.from : "";
  const to = typeof raw.to === "string" ? raw.to : "";

  if (!externalStringId || !key || !locale) {
    return null;
  }

  const itemId =
    typeof raw.itemId === "string"
      ? raw.itemId
      : buildAgentRunProposalItemId({ externalStringId, locale });

  const reviewState =
    raw.reviewState === "accepted" ||
    raw.reviewState === "rejected" ||
    raw.reviewState === "pending"
      ? raw.reviewState
      : "pending";

  const changedFields = Array.isArray(raw.changedFields)
    ? raw.changedFields.filter((field): field is string => typeof field === "string")
    : deriveChangedFields(from, to);

  const warnings =
    raw.warnings && typeof raw.warnings === "object" && !Array.isArray(raw.warnings)
      ? (raw.warnings as AgentRunProposalWarnings)
      : detectAgentRunProposalWarnings({
          sourceText,
          from,
          to,
          locale,
          glossaryTerms,
        });

  return {
    itemId,
    externalStringId,
    key,
    locale,
    sourceText,
    from,
    to,
    reviewState,
    changedFields: changedFields.length > 0 ? changedFields : deriveChangedFields(from, to),
    warnings,
  };
}

export function parseAgentRunProposalItems(
  changedItems: Record<string, unknown>[],
  glossaryTerms?: Parameters<typeof detectAgentRunProposalWarnings>[0]["glossaryTerms"],
) {
  return changedItems
    .map((item) => enrichAgentRunProposalItem(item, glossaryTerms))
    .filter((item): item is AgentRunProposalItem => item !== null);
}

export function serializeAgentRunProposalItem(item: AgentRunProposalItem) {
  return {
    itemId: item.itemId,
    externalStringId: item.externalStringId,
    key: item.key,
    locale: item.locale,
    sourceText: item.sourceText,
    from: item.from,
    to: item.to,
    reviewState: item.reviewState,
    changedFields: item.changedFields,
    warnings: item.warnings,
  };
}

export function applyAgentRunProposalReviewUpdates(input: {
  changedItems: Record<string, unknown>[];
  updates: Array<{ itemId: string; reviewState: AgentRunProposalReviewState }>;
}) {
  const updatesById = new Map(input.updates.map((update) => [update.itemId, update.reviewState]));

  return input.changedItems.map((raw) => {
    const item = enrichAgentRunProposalItem(raw);
    if (!item) {
      return raw;
    }

    const nextState = updatesById.get(item.itemId);
    if (!nextState) {
      return serializeAgentRunProposalItem(item);
    }

    return serializeAgentRunProposalItem({ ...item, reviewState: nextState });
  });
}

export function applyBulkAgentRunProposalReview(input: {
  changedItems: Record<string, unknown>[];
  reviewState: Extract<AgentRunProposalReviewState, "accepted" | "rejected">;
  itemIds?: string[];
  filter?: "pending" | "all";
}) {
  const itemIdSet = input.itemIds ? new Set(input.itemIds) : null;

  return input.changedItems.map((raw) => {
    const item = enrichAgentRunProposalItem(raw);
    if (!item) {
      return raw;
    }

    if (itemIdSet && !itemIdSet.has(item.itemId)) {
      return serializeAgentRunProposalItem(item);
    }

    if (!itemIdSet && input.filter === "pending" && item.reviewState !== "pending") {
      return serializeAgentRunProposalItem(item);
    }

    return serializeAgentRunProposalItem({ ...item, reviewState: input.reviewState });
  });
}

export function countAgentRunProposalReviewStates(items: AgentRunProposalItem[]) {
  return items.reduce(
    (counts, item) => {
      counts[item.reviewState] += 1;
      return counts;
    },
    { pending: 0, accepted: 0, rejected: 0 },
  );
}

export function agentRunHasReviewableProposals(input: {
  kind: string;
  status: string;
  changedItems: Record<string, unknown>[];
}) {
  if (input.status !== "succeeded") {
    return false;
  }

  if (input.kind !== "translate" && input.kind !== "qa_fix") {
    return false;
  }

  return parseAgentRunProposalItems(input.changedItems).length > 0;
}
