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
import { cn } from "@/lib/primitives/cn";

import { catIntelligencePanelMessages } from "@/components/cat/shared/cat.messages";
import type { CatGlossaryConcept, CatGlossaryConceptTerm } from "@/components/cat/shared/types";

import {
  normalizedCatGlossaryTermStatus,
  type CatGlossaryTermStatus,
} from "./cat-glossary-term-status";

function readableLabel(value: string | null | undefined) {
  if (!value) return null;
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function termStatus(term: CatGlossaryConceptTerm, intl: ReturnType<typeof useIntl>) {
  const status = normalizedCatGlossaryTermStatus(term);
  const labels = {
    preferred: catIntelligencePanelMessages.glossaryPreferred,
    admitted: catIntelligencePanelMessages.glossaryAdmitted,
    draft: catIntelligencePanelMessages.glossaryDraft,
    not_recommended: catIntelligencePanelMessages.glossaryNotRecommended,
    obsolete: catIntelligencePanelMessages.glossaryObsolete,
  } satisfies Record<
    CatGlossaryTermStatus,
    (typeof catIntelligencePanelMessages)[keyof typeof catIntelligencePanelMessages]
  >;
  const classNames = {
    preferred: "border-emerald-500/30 text-emerald-300",
    admitted: "border-sky-500/30 text-sky-300",
    draft: "border-amber-500/30 text-amber-300",
    not_recommended: "border-rose-500/30 text-rose-300",
    obsolete: "border-slate-500/30 text-slate-300",
  } satisfies Record<CatGlossaryTermStatus, string>;
  return { status, label: intl.formatMessage(labels[status]), className: classNames[status] };
}

function TermStatusIcon({ status }: { status: CatGlossaryTermStatus }) {
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

function ConceptTermRow({ term }: { term: CatGlossaryConceptTerm }) {
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
        className="h-5 shrink-0 rounded-md border-input bg-background/30 px-1.5 text-[10px] uppercase tracking-wide"
      >
        {term.locale}
      </Badge>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <p className="min-w-24 flex-1 break-words text-sm font-medium leading-tight text-foreground">
          {term.text}
        </p>
        <div className="flex flex-wrap gap-1">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-medium",
              status.className,
            )}
          >
            <TermStatusIcon status={status.status} />
            {status.label}
          </span>
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
            ? intl.formatMessage(catIntelligencePanelMessages.glossaryTermCopied)
            : copyState === "error"
              ? intl.formatMessage(catIntelligencePanelMessages.glossaryTermCopyFailed)
              : intl.formatMessage(catIntelligencePanelMessages.copyGlossaryTerm)}
        </span>
      </Button>
    </div>
  );
}

function CollapsedTargetTermRow({ term }: { term: CatGlossaryConceptTerm }) {
  const intl = useIntl();
  const status = termStatus(term, intl);
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-1.5">
      <span className="min-w-0 truncate text-sm font-medium text-foreground">{term.text}</span>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-medium",
          status.className,
        )}
      >
        <TermStatusIcon status={status.status} />
        {status.label}
      </span>
    </div>
  );
}

export function CatGlossaryConceptCard({
  concept,
  expanded,
  onToggle,
}: {
  concept: CatGlossaryConcept;
  expanded: boolean;
  onToggle: () => void;
}) {
  const intl = useIntl();
  const contentId = `glossary-concept-${concept.id.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;
  const sourceTerms = concept.sourceTerms.length > 0 ? concept.sourceTerms : concept.targetTerms;
  const targetTerms = concept.targetTerms.length > 0 ? concept.targetTerms : concept.sourceTerms;

  return (
    <article className="overflow-hidden rounded-xl bg-muted/40">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-background/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={expanded}
        aria-controls={contentId}
        aria-label={intl.formatMessage(
          expanded
            ? catIntelligencePanelMessages.glossaryConceptCollapse
            : catIntelligencePanelMessages.glossaryConceptExpand,
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
        </span>
        <HugeiconsIcon
          icon={expanded ? ArrowUp01Icon : ArrowDown01Icon}
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </button>

      {!expanded ? (
        <div className="space-y-1 px-3 pb-2">
          {targetTerms.map((term) => (
            <CollapsedTargetTermRow key={term.id} term={term} />
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
              <ConceptTermRow key={term.id} term={term} />
            ))}
          </div>
          <div className="space-y-1">
            {targetTerms.map((term) => (
              <ConceptTermRow key={term.id} term={term} />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2 pt-1">
        {concept.glossaryUrl?.startsWith("/org/") ? (
          <Link
            href={concept.glossaryUrl}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <FormattedMessage {...catIntelligencePanelMessages.openGlossary} />
          </Link>
        ) : null}
        {concept.conceptUrl?.startsWith("/org/") ? (
          <Link
            href={concept.conceptUrl}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <FormattedMessage {...catIntelligencePanelMessages.openConcept} />
          </Link>
        ) : null}
      </div>
    </article>
  );
}
