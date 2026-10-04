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
import {
  ArrowClockwiseIcon,
  MagnifyingGlassIcon,
  ProhibitIcon,
  SparkleIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/primitives/cn";

import {
  documentAssistantAiCacheKey,
  type DocumentAssistantServices,
  type DocumentConcordance,
} from "./document-editor-assistant.types";
import { checkDocumentGlossary } from "./document-editor-glossary";
import { documentEditorMessages as messages } from "./document-editor.messages";

const LOOKUP_DEBOUNCE_MS = 300;
const MAX_TM_MATCHES = 5;

export type DocumentAssistantFocus =
  | { status: "none" }
  | { status: "no-source" }
  | {
      status: "ok";
      sourceMarkdown: string;
      sourceText: string;
      targetMarkdown: string;
      targetText: string;
    };

type Loadable<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; value: T };

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border/60 px-4 py-3 last:border-b-0">
      <header className="mb-2 flex min-h-6 items-center justify-between gap-2">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </h3>
        {action}
      </header>
      {children}
    </section>
  );
}

function SectionStatus({ state, empty }: { state: Loadable<unknown>; empty?: boolean }) {
  const intl = useIntl();
  if (state.status === "loading") {
    return <Spinner className="size-4 text-muted-foreground" />;
  }
  if (state.status === "error") {
    return (
      <p className="text-sm text-destructive">{intl.formatMessage(messages.assistantLoadFailed)}</p>
    );
  }
  if (empty) {
    return (
      <p className="text-sm text-muted-foreground">
        {intl.formatMessage(messages.assistantNoMatches)}
      </p>
    );
  }
  return null;
}

function ConcordanceResults({
  concordance,
  canEdit,
  onInsert,
}: {
  concordance: DocumentConcordance;
  canEdit: boolean;
  onInsert: (text: string) => void;
}) {
  const intl = useIntl();
  const matches = concordance.translationMemoryMatches.slice(0, MAX_TM_MATCHES);
  if (matches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {intl.formatMessage(messages.assistantNoMatches)}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {matches.map((match) => (
        <li key={match.id} className="group/tm rounded-lg border border-border/70 p-2.5 text-sm">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span
              className={cn(
                "rounded px-1.5 text-[11px] font-medium tabular-nums",
                match.matchPercent >= 100
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {intl.formatMessage(messages.assistantMatchPercent, {
                percent: Math.round(match.matchPercent),
              })}
            </span>
            {canEdit ? (
              <Button
                size="xs"
                variant="ghost"
                className="opacity-0 group-hover/tm:opacity-100 focus-visible:opacity-100"
                onClick={() => onInsert(match.targetText)}
              >
                {intl.formatMessage(messages.assistantInsert)}
              </Button>
            ) : null}
          </div>
          <p className="text-muted-foreground">{match.sourceText}</p>
          <p className="mt-1 text-foreground">{match.targetText}</p>
          {match.contextLabel ? (
            <p className="mt-1 truncate text-xs text-muted-foreground/80">{match.contextLabel}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function DocumentEditorAssistantPanel({
  services,
  focus,
  canEdit,
  onReplaceBlock,
  onClose,
  concordanceSeed,
}: {
  services: DocumentAssistantServices;
  focus: DocumentAssistantFocus;
  canEdit: boolean;
  onReplaceBlock: (markdown: string) => void;
  onClose: () => void;
  concordanceSeed?: { query: string; nonce: number } | null;
}) {
  const intl = useIntl();
  const sourceText = focus.status === "ok" ? focus.sourceText : null;
  const aiKey =
    focus.status === "ok"
      ? documentAssistantAiCacheKey(focus.sourceMarkdown, focus.targetMarkdown)
      : null;
  const lookupCache = useRef(new Map<string, DocumentConcordance>());
  const aiCache = useRef(new Map<string, string>());
  const servicesRef = useRef(services);
  servicesRef.current = services;
  const [lookup, setLookup] = useState<Loadable<DocumentConcordance>>({ status: "idle" });
  const [ai, setAi] = useState<Loadable<string>>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<Loadable<DocumentConcordance>>({ status: "idle" });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchRequest = useRef(0);

  useEffect(() => {
    const cachedAi = aiKey ? aiCache.current.get(aiKey) : undefined;
    setAi(cachedAi ? { status: "ok", value: cachedAi } : { status: "idle" });
  }, [aiKey]);

  useEffect(() => {
    if (!sourceText) {
      setLookup({ status: "idle" });
      return;
    }
    const cached = lookupCache.current.get(sourceText);
    if (cached) {
      setLookup({ status: "ok", value: cached });
      return;
    }
    let cancelled = false;
    setLookup({ status: "loading" });
    const timer = window.setTimeout(() => {
      servicesRef.current
        .lookupConcordance(sourceText)
        .then((value) => {
          lookupCache.current.set(sourceText, value);
          if (!cancelled) setLookup({ status: "ok", value });
        })
        .catch(() => {
          if (!cancelled) setLookup({ status: "error" });
        });
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sourceText]);

  const runSearch = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const request = ++searchRequest.current;
    setSearch({ status: "loading" });
    servicesRef.current
      .lookupConcordance(trimmed)
      .then((value) => {
        if (request === searchRequest.current) setSearch({ status: "ok", value });
      })
      .catch(() => {
        if (request === searchRequest.current) setSearch({ status: "error" });
      });
  }, []);

  useEffect(() => {
    if (!concordanceSeed) return;
    setQuery(concordanceSeed.query);
    searchInputRef.current?.focus();
    runSearch(concordanceSeed.query);
  }, [concordanceSeed, runSearch]);

  const aiKeyRef = useRef(aiKey);
  aiKeyRef.current = aiKey;
  const suggest = () => {
    if (focus.status !== "ok" || !aiKey) return;
    const key = aiKey;
    setAi({ status: "loading" });
    servicesRef.current
      .translateBlock({
        sourceMarkdown: focus.sourceMarkdown,
        targetMarkdown: focus.targetMarkdown,
      })
      .then((result) => {
        aiCache.current.set(key, result.suggestion);
        if (aiKeyRef.current === key) setAi({ status: "ok", value: result.suggestion });
      })
      .catch(() => {
        if (aiKeyRef.current === key) setAi({ status: "error" });
      });
  };

  const glossary =
    focus.status === "ok" && lookup.status === "ok"
      ? checkDocumentGlossary(lookup.value.glossaryTerms, focus.sourceText, focus.targetText)
      : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <SparkleIcon className="size-4 text-violet-500" weight="fill" />
          {intl.formatMessage(messages.assistant)}
        </h2>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={intl.formatMessage(messages.assistantClose)}
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {focus.status === "none" ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {intl.formatMessage(messages.assistantEmpty)}
          </p>
        ) : focus.status === "no-source" ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {intl.formatMessage(messages.assistantNoSource)}
          </p>
        ) : (
          <>
            <Section
              title={`${intl.formatMessage(messages.sourceTitle)} · ${services.sourceLocale}`}
              action={
                canEdit ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => onReplaceBlock(focus.sourceMarkdown)}
                  >
                    {intl.formatMessage(messages.assistantUseSource)}
                  </Button>
                ) : null
              }
            >
              <p className="text-sm leading-6 whitespace-pre-wrap text-foreground">
                {focus.sourceText}
              </p>
            </Section>
            <Section
              title={intl.formatMessage(messages.assistantAi)}
              action={
                ai.status === "ok" || ai.status === "error" ? (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={intl.formatMessage(messages.assistantRegenerate)}
                    title={intl.formatMessage(messages.assistantRegenerate)}
                    onClick={suggest}
                  >
                    <ArrowClockwiseIcon />
                  </Button>
                ) : null
              }
            >
              {ai.status === "idle" ? (
                <Button size="sm" variant="outline" onClick={suggest} disabled={!canEdit}>
                  <SparkleIcon data-icon="inline-start" className="text-violet-500" />
                  {intl.formatMessage(messages.translateBlock)}
                </Button>
              ) : ai.status === "ok" ? (
                <div className="rounded-lg border border-violet-500/25 bg-violet-500/5 p-2.5">
                  <p className="text-sm leading-6 whitespace-pre-wrap">{ai.value}</p>
                  {canEdit ? (
                    <div className="mt-2 flex justify-end">
                      <Button size="xs" onClick={() => onReplaceBlock(ai.value)}>
                        {intl.formatMessage(messages.assistantInsert)}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <SectionStatus state={ai} />
              )}
            </Section>
            <Section title={intl.formatMessage(messages.assistantGlossary)}>
              {lookup.status === "ok" ? (
                glossary.length === 0 ? (
                  <SectionStatus state={lookup} empty />
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {glossary.map(({ term, status }) => (
                      <li key={term.id} className="flex items-start gap-2 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="text-muted-foreground">{term.source}</span>
                          <span className="mx-1.5 text-muted-foreground/60">→</span>
                          <span className={cn(term.forbidden && "line-through")}>
                            {term.target}
                          </span>
                        </span>
                        {status === "forbidden" ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-destructive">
                            <ProhibitIcon className="size-3.5" />
                            {intl.formatMessage(messages.glossaryUsesForbidden)}
                          </span>
                        ) : status === "missing" ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                            <WarningIcon className="size-3.5" />
                            {intl.formatMessage(messages.glossaryMissing)}
                          </span>
                        ) : term.forbidden ? (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {intl.formatMessage(messages.glossaryForbidden)}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <SectionStatus state={lookup} />
              )}
            </Section>
            <Section title={intl.formatMessage(messages.assistantTm)}>
              {lookup.status === "ok" ? (
                <ConcordanceResults
                  concordance={lookup.value}
                  canEdit={canEdit}
                  onInsert={onReplaceBlock}
                />
              ) : (
                <SectionStatus state={lookup} />
              )}
            </Section>
          </>
        )}
        <Section title={intl.formatMessage(messages.assistantConcordance)}>
          <form
            className="relative mb-3"
            onSubmit={(event) => {
              event.preventDefault();
              runSearch(query);
            }}
          >
            <MagnifyingGlassIcon className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={intl.formatMessage(messages.assistantConcordancePlaceholder)}
              aria-label={intl.formatMessage(messages.assistantConcordance)}
              className="ps-8"
            />
          </form>
          {search.status === "ok" ? (
            <ConcordanceResults
              concordance={search.value}
              canEdit={false}
              onInsert={onReplaceBlock}
            />
          ) : (
            <SectionStatus state={search} />
          )}
        </Section>
      </div>
    </div>
  );
}
