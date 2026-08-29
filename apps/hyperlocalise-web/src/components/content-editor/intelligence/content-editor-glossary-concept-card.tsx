"use client";

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
import { useState } from "react";
import { ArrowDown01Icon, ArrowUp01Icon, Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { canonicalizeLocale } from "@/lib/i18n/locales";
import { cn } from "@/lib/primitives/cn";

import { contentEditorIntelligencePanelMessages } from "@/components/content-editor/shared/content-editor.messages";
import type {
  ContentEditorGlossaryConcept,
  ContentEditorGlossaryConceptTerm,
} from "@/components/content-editor/shared/types";

import {
  normalizedCatGlossaryTermStatus,
  type ContentEditorGlossaryTermStatus,
} from "./content-editor-glossary-term-status";

function readableLabel(value: string | null | undefined) {
  if (!value) return null;
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function termStatus(term: ContentEditorGlossaryConceptTerm, intl: ReturnType<typeof useIntl>) {
  const status = normalizedCatGlossaryTermStatus(term);
  const labels = {
    preferred: contentEditorIntelligencePanelMessages.glossaryPreferred,
    admitted: contentEditorIntelligencePanelMessages.glossaryAdmitted,
    draft: contentEditorIntelligencePanelMessages.glossaryDraft,
    not_recommended: contentEditorIntelligencePanelMessages.glossaryNotRecommended,
    obsolete: contentEditorIntelligencePanelMessages.glossaryObsolete,
  } satisfies Record<
    ContentEditorGlossaryTermStatus,
    (typeof contentEditorIntelligencePanelMessages)[keyof typeof contentEditorIntelligencePanelMessages]
  >;
  const classNames = {
    preferred: "border-emerald-500/30 text-emerald-300",
    admitted: "border-sky-500/30 text-sky-300",
    draft: "border-amber-500/30 text-amber-300",
    not_recommended: "border-rose-500/30 text-rose-300",
    obsolete: "border-slate-500/30 text-slate-300",
  } satisfies Record<ContentEditorGlossaryTermStatus, string>;
  return { status, label: intl.formatMessage(labels[status]), className: classNames[status] };
}

function TermStatusIcon({ status }: { status: ContentEditorGlossaryTermStatus }) {
  if (status === "preferred") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className="size-3.5 shrink-0" aria-hidden="true">
        <circle cx="8" cy="8" r="7" className="fill-emerald-500" />
        <path
          d="m5 8.2 2 2 4-4"
          stroke="white"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === "admitted") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className="size-3.5 shrink-0" aria-hidden="true">
        <circle cx="8" cy="8" r="6" className="stroke-sky-500" strokeWidth="1.75" />
        <circle cx="8" cy="8" r="2.25" className="fill-sky-500" />
      </svg>
    );
  }
  if (status === "draft") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className="size-3.5 shrink-0" aria-hidden="true">
        <circle cx="8" cy="8" r="6" className="stroke-amber-500" strokeWidth="1.75" />
        <path d="M8 2a6 6 0 0 1 0 12Z" className="fill-amber-500" />
      </svg>
    );
  }
  if (status === "not_recommended") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className="size-3.5 shrink-0" aria-hidden="true">
        <circle cx="8" cy="8" r="6" className="stroke-rose-500" strokeWidth="1.75" />
        <path d="M5.5 8h5" className="stroke-rose-500" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-3.5 shrink-0" aria-hidden="true">
      <circle cx="8" cy="8" r="7" className="fill-slate-500" />
      <path d="m5.5 5.5 5 5m0-5-5 5" stroke="white" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function UntranslatableBadge({ intl }: { intl: ReturnType<typeof useIntl> }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-500/30 px-1.5 py-0.5 text-xs font-medium text-slate-300">
      {intl.formatMessage(contentEditorIntelligencePanelMessages.glossaryUntranslatable)}
    </span>
  );
}

function ConceptTermRow({
  term,
  showUntranslatableBadge = false,
}: {
  term: ContentEditorGlossaryConceptTerm;
  showUntranslatableBadge?: boolean;
}) {
  const intl = useIntl();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const status = termStatus(term, intl);

  async function copyTerm() {
    if (!term.text.trim() || typeof navigator === "undefined" || !navigator.clipboard) {
      setCopyState("error");
      return;
    }
    try {
      await navigator.clipboard.writeText(term.text);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("error");
    }
  }

  const metadata = [term.termType, term.partOfSpeech, term.gender]
    .map(readableLabel)
    .filter((value): value is string => Boolean(value));

  return (
    <div className="flex min-h-9 items-center gap-2 rounded-lg bg-input/30 px-2.5 py-1.5">
      <Badge
        variant="outline"
        className="h-5 shrink-0 rounded-md border-input bg-background/30 px-1.5 text-[10px] tracking-wide"
      >
        {canonicalizeLocale(term.locale) ?? term.locale}
      </Badge>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <p className="min-w-24 flex-1 break-words text-sm font-medium leading-tight text-foreground">
          {term.text}
        </p>
        <div className="flex flex-wrap gap-1">
          {showUntranslatableBadge ? (
            <UntranslatableBadge intl={intl} />
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-medium",
                status.className,
              )}
            >
              <TermStatusIcon status={status.status} />
              {status.label}
            </span>
          )}
          {metadata.map((value) => (
            <span
              key={value}
              className="rounded-md bg-background/20 px-1.5 py-0.5 text-xs text-muted-foreground"
            >
              {value}
            </span>
          ))}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="shrink-0"
        onClick={() => void copyTerm()}
      >
        {copyState === "copied" ? (
          <HugeiconsIcon icon={Tick02Icon} className="size-3" aria-hidden />
        ) : (
          <HugeiconsIcon icon={Copy01Icon} className="size-3" aria-hidden />
        )}
        <span className="sr-only">
          {copyState === "copied"
            ? intl.formatMessage(contentEditorIntelligencePanelMessages.glossaryTermCopied)
            : copyState === "error"
              ? intl.formatMessage(contentEditorIntelligencePanelMessages.glossaryTermCopyFailed)
              : intl.formatMessage(contentEditorIntelligencePanelMessages.copyGlossaryTerm)}
        </span>
      </Button>
    </div>
  );
}

function CollapsedTermRow({
  term,
  showUntranslatableBadge = false,
}: {
  term: ContentEditorGlossaryConceptTerm;
  showUntranslatableBadge?: boolean;
}) {
  const intl = useIntl();
  const status = termStatus(term, intl);
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-1.5">
      <span className="min-w-0 truncate text-sm font-medium text-foreground">{term.text}</span>
      {showUntranslatableBadge ? (
        <UntranslatableBadge intl={intl} />
      ) : (
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-medium",
            status.className,
          )}
        >
          <TermStatusIcon status={status.status} />
          {status.label}
        </span>
      )}
    </div>
  );
}

function resolveConceptDisplayTerms(concept: ContentEditorGlossaryConcept) {
  const isUntranslatable = concept.translatable === false;
  const fallbackSourceTerm: ContentEditorGlossaryConceptTerm[] = concept.primaryTerm.trim()
    ? [
        {
          id: `${concept.id}:primary`,
          locale: concept.sourceTerms[0]?.locale ?? "source",
          text: concept.primaryTerm,
        },
      ]
    : [];
  const sourceTerms = concept.sourceTerms.length > 0 ? concept.sourceTerms : fallbackSourceTerm;
  const hasTargetTerms = concept.targetTerms.length > 0;

  if (isUntranslatable) {
    return {
      isUntranslatable: true,
      sourceTerms,
      targetTerms: [] as ContentEditorGlossaryConceptTerm[],
      collapsedTerms: sourceTerms,
    };
  }

  if (hasTargetTerms) {
    return {
      isUntranslatable: false,
      sourceTerms,
      targetTerms: concept.targetTerms,
      collapsedTerms: concept.targetTerms,
    };
  }

  return {
    isUntranslatable: false,
    sourceTerms,
    targetTerms: [] as ContentEditorGlossaryConceptTerm[],
    collapsedTerms: sourceTerms,
  };
}

export function ContentEditorGlossaryConceptCard({
  concept,
  teamName,
  expanded,
  onToggle,
}: {
  concept: ContentEditorGlossaryConcept;
  teamName?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const intl = useIntl();
  const contentId = `glossary-concept-${concept.id.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;
  const { isUntranslatable, sourceTerms, targetTerms, collapsedTerms } =
    resolveConceptDisplayTerms(concept);

  return (
    <article className="overflow-hidden rounded-xl bg-muted/40">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-background/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={expanded}
        aria-controls={contentId}
        aria-label={intl.formatMessage(
          expanded
            ? contentEditorIntelligencePanelMessages.glossaryConceptCollapse
            : contentEditorIntelligencePanelMessages.glossaryConceptExpand,
        )}
        onClick={onToggle}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-base font-semibold text-foreground">
            {concept.primaryTerm}
          </span>
          <Badge
            variant="secondary"
            className="h-6 max-w-full truncate rounded-md px-2 text-xs font-normal"
          >
            {concept.glossaryName}
          </Badge>
          {teamName ? (
            <Badge
              variant="outline"
              className="h-6 max-w-full truncate rounded-md px-2 text-xs font-normal"
            >
              {teamName}
            </Badge>
          ) : null}
        </span>
        <HugeiconsIcon
          icon={expanded ? ArrowUp01Icon : ArrowDown01Icon}
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </button>

      {!expanded ? (
        <div className="space-y-1 px-3 pb-2">
          {collapsedTerms.map((term) => (
            <CollapsedTermRow
              key={term.id}
              term={term}
              showUntranslatableBadge={isUntranslatable}
            />
          ))}
        </div>
      ) : null}

      <div id={contentId} className={cn("px-3 pb-2.5", !expanded && "hidden")}>
        {concept.definition || concept.subject ? (
          <div className="mb-2 rounded-lg bg-input/20 px-2.5 py-2">
            {concept.definition ? (
              <p className="text-sm leading-relaxed text-foreground">{concept.definition}</p>
            ) : null}
            {concept.subject ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{concept.subject}</p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="space-y-1">
            {sourceTerms.map((term) => (
              <ConceptTermRow
                key={term.id}
                term={term}
                showUntranslatableBadge={isUntranslatable}
              />
            ))}
          </div>
          {targetTerms.length > 0 ? (
            <div className="space-y-1">
              {targetTerms.map((term) => (
                <ConceptTermRow key={term.id} term={term} />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2 pt-1">
        {concept.glossaryUrl?.startsWith("/org/") ? (
          <Link
            href={concept.glossaryUrl}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <FormattedMessage {...contentEditorIntelligencePanelMessages.openGlossary} />
          </Link>
        ) : null}
        {concept.conceptUrl?.startsWith("/org/") ? (
          <Link
            href={concept.conceptUrl}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <FormattedMessage {...contentEditorIntelligencePanelMessages.openConcept} />
          </Link>
        ) : null}
      </div>
    </article>
  );
}
