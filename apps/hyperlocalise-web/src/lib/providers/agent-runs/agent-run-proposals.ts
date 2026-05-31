import {
  type GlossaryTermConstraint,
  translationUnitHasGlossaryViolations,
  validateGlossaryForTranslationUnits,
} from "@/lib/glossary/validate-glossary-terms-in-translation";
import type { AgentRunGlossaryMatchUsage } from "@/lib/providers/contracts/glossary-match";
import type { AgentRunTranslationMemoryMatchUsage } from "@/lib/providers/contracts/translation-memory-match";

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
  translationMemoryMatchesUsed?: AgentRunTranslationMemoryMatchUsage[];
  glossaryMatchesUsed?: AgentRunGlossaryMatchUsage[];
};

type AgentRunProposalGlossaryTermInput = {
  sourceTerm: string;
  targetTerm: string;
  targetLocale?: string;
  forbidden?: boolean | null;
  caseSensitive?: boolean | null;
};

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

function normalizeGlossaryTerms(
  glossaryTerms: AgentRunProposalGlossaryTermInput[] | undefined,
  locale: string,
): GlossaryTermConstraint[] {
  return (glossaryTerms ?? []).map((term) => ({
    sourceTerm: term.sourceTerm,
    targetTerm: term.targetTerm,
    targetLocale: term.targetLocale ?? locale,
    forbidden: term.forbidden ?? null,
    caseSensitive: term.caseSensitive ?? null,
  }));
}

function toProposalTranslationUnit(input: {
  externalStringId: string;
  key: string;
  locale: string;
  sourceText: string;
  translatedText: string;
}) {
  return {
    externalStringId: input.externalStringId,
    key: input.key,
    locale: input.locale,
    sourceText: input.sourceText,
    translatedText: input.translatedText,
  };
}

function collectGlossaryWarningsForProposalUnits(
  units: ReturnType<typeof toProposalTranslationUnit>[],
  glossaryTerms: GlossaryTermConstraint[],
) {
  const failuresByUnitKey = validateGlossaryForTranslationUnits(units, glossaryTerms);
  const warnedUnitKeys = new Set<string>();

  for (const unit of units) {
    const unitKey = buildAgentRunProposalItemId({
      externalStringId: unit.externalStringId,
      locale: unit.locale,
    });
    if (failuresByUnitKey.has(`${unit.externalStringId}:${unit.locale}`)) {
      warnedUnitKeys.add(unitKey);
    }
  }

  return warnedUnitKeys;
}

function toGlossaryTermConstraints(
  glossaryTerms: AgentRunProposalGlossaryTermInput[] | undefined,
): GlossaryTermConstraint[] {
  return (glossaryTerms ?? [])
    .filter(
      (term): term is AgentRunProposalGlossaryTermInput & { targetLocale: string } =>
        typeof term.targetLocale === "string" && term.targetLocale.length > 0,
    )
    .map((term) => ({
      sourceTerm: term.sourceTerm,
      targetTerm: term.targetTerm,
      targetLocale: term.targetLocale,
      forbidden: term.forbidden ?? null,
      caseSensitive: term.caseSensitive ?? null,
    }));
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
  externalStringId?: string;
  key?: string;
  glossaryTerms?: AgentRunProposalGlossaryTermInput[];
}): AgentRunProposalWarnings {
  const glossaryTerms = normalizeGlossaryTerms(input.glossaryTerms, input.locale);
  const warnings: AgentRunProposalWarnings = {};

  if (glossaryTerms.length > 0) {
    const unit = toProposalTranslationUnit({
      externalStringId: input.externalStringId ?? "proposal",
      key: input.key ?? "proposal",
      locale: input.locale,
      sourceText: input.sourceText,
      translatedText: input.to,
    });

    if (translationUnitHasGlossaryViolations(unit, glossaryTerms)) {
      warnings.glossary = true;
    }
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
  glossaryTerms?: AgentRunProposalGlossaryTermInput[],
  glossaryWarningsByUnitKey?: Set<string>,
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

  const translationMemoryMatchesUsed = Array.isArray(raw.translationMemoryMatchesUsed)
    ? raw.translationMemoryMatchesUsed.filter(
        (match): match is AgentRunTranslationMemoryMatchUsage =>
          typeof match === "object" &&
          match !== null &&
          typeof (match as AgentRunTranslationMemoryMatchUsage).memoryId === "string" &&
          typeof (match as AgentRunTranslationMemoryMatchUsage).targetLocale === "string",
      )
    : undefined;

  const glossaryMatchesUsed = Array.isArray(raw.glossaryMatchesUsed)
    ? raw.glossaryMatchesUsed.filter(
        (match): match is AgentRunGlossaryMatchUsage =>
          typeof match === "object" &&
          match !== null &&
          typeof (match as AgentRunGlossaryMatchUsage).glossaryId === "string" &&
          typeof (match as AgentRunGlossaryMatchUsage).targetLocale === "string",
      )
    : undefined;

  const warnings =
    raw.warnings && typeof raw.warnings === "object" && !Array.isArray(raw.warnings)
      ? (raw.warnings as AgentRunProposalWarnings)
      : {
          ...detectAgentRunProposalWarnings({
            sourceText,
            from,
            to,
            locale,
            externalStringId,
            key,
            glossaryTerms: glossaryWarningsByUnitKey ? undefined : glossaryTerms,
          }),
          ...(glossaryWarningsByUnitKey?.has(
            buildAgentRunProposalItemId({ externalStringId, locale }),
          )
            ? { glossary: true }
            : {}),
        };

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
    translationMemoryMatchesUsed,
    glossaryMatchesUsed,
  };
}

export function parseAgentRunProposalItems(
  changedItems: Record<string, unknown>[],
  glossaryTerms?: AgentRunProposalGlossaryTermInput[],
) {
  const glossaryConstraintTerms = toGlossaryTermConstraints(glossaryTerms);
  const proposalUnits = changedItems
    .map((raw) => {
      const externalStringId =
        typeof raw.externalStringId === "string" ? raw.externalStringId : null;
      const key = typeof raw.key === "string" ? raw.key : null;
      const locale = typeof raw.locale === "string" ? raw.locale : null;
      const sourceText = typeof raw.sourceText === "string" ? raw.sourceText : "";
      const to = typeof raw.to === "string" ? raw.to : "";

      if (!externalStringId || !key || !locale) {
        return null;
      }

      return toProposalTranslationUnit({
        externalStringId,
        key,
        locale,
        sourceText,
        translatedText: to,
      });
    })
    .filter((unit): unit is NonNullable<typeof unit> => unit !== null);

  const glossaryWarningsByUnitKey =
    glossaryConstraintTerms.length > 0
      ? collectGlossaryWarningsForProposalUnits(proposalUnits, glossaryConstraintTerms)
      : undefined;

  return changedItems
    .map((item) => enrichAgentRunProposalItem(item, glossaryTerms, glossaryWarningsByUnitKey))
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
    ...(item.translationMemoryMatchesUsed?.length
      ? { translationMemoryMatchesUsed: item.translationMemoryMatchesUsed }
      : {}),
    ...(item.glossaryMatchesUsed?.length ? { glossaryMatchesUsed: item.glossaryMatchesUsed } : {}),
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

export type AcceptedAgentRunProposal = AgentRunProposalItem & {
  sourceAgentRunId: string;
};

export function isPushApprovedWritebackAgentRun(inputSnapshot: Record<string, unknown>) {
  return inputSnapshot.action === "push_approved_changes";
}

export function collectAcceptedAgentRunProposalsForJob(input: {
  runs: Array<{
    id: string;
    kind: string;
    status: string;
    inputSnapshot: Record<string, unknown>;
    changedItems: Record<string, unknown>[];
    createdAt: Date;
  }>;
}) {
  const proposalRuns = input.runs
    .filter(
      (run) =>
        run.status === "succeeded" &&
        (run.kind === "translate" || run.kind === "qa_fix") &&
        !isPushApprovedWritebackAgentRun(run.inputSnapshot),
    )
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  const acceptedByItemId = new Map<string, AcceptedAgentRunProposal>();

  for (const run of proposalRuns) {
    const proposals = parseAgentRunProposalItems(run.changedItems);
    for (const proposal of proposals) {
      if (proposal.reviewState !== "accepted") {
        continue;
      }

      if (!acceptedByItemId.has(proposal.itemId)) {
        acceptedByItemId.set(proposal.itemId, {
          ...proposal,
          sourceAgentRunId: run.id,
        });
      }
    }
  }

  return [...acceptedByItemId.values()];
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
