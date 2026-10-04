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
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import Image from "next/image";
import { useState } from "react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/primitives/cn";

import type { PricingBrowserModel, PricingModelsSectionContent } from "./pricing-page-content";
import { pricingModelsBrowserMessages } from "./pricing-models-browser.messages";

type PricingModelsBrowserProps = Omit<PricingModelsSectionContent, "heading" | "subcopy">;

const providerLogos: Record<string, { src: string; width: number; height: number }> = {
  openai: { src: "/images/openai-old-logo.webp", width: 32, height: 32 },
  anthropic: { src: "/images/claude.png", width: 32, height: 32 },
  gemini: { src: "/images/gemini.webp", width: 32, height: 32 },
};

const initialScope = "recommended";
const initialJob = "all";
const initialAccess = "all";

export function PricingModelsBrowser({
  searchLabel,
  searchPlaceholder,
  jobFilterLabel,
  accessFilterLabel,
  scopeFilterLabel,
  scopes,
  jobs,
  accessOptions,
  columnModel,
  columnHelpsWith,
  columnBilling,
  useWhenLabel,
  modelIdLabel,
  models,
  emptyRecommendedTitle,
  emptyRecommendedBody,
  showEveryModelLabel,
  emptyTitle,
  emptyBody,
  clearFiltersLabel,
  listLabel,
  footnote,
}: PricingModelsBrowserProps) {
  const intl = useIntl();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState(initialScope);
  const [job, setJob] = useState(initialJob);
  const [access, setAccess] = useState(initialAccess);
  const [pickedId, setPickedId] = useState(models[0]?.modelId ?? "");

  const normalizedQuery = query.trim().toLowerCase();
  const visible = models.filter((model) => {
    if (scope === initialScope && !model.recommended) return false;
    if (job !== initialJob && model.job !== job) return false;
    if (access !== initialAccess && model.access !== access) return false;
    if (!normalizedQuery) return true;
    const haystack =
      `${model.name} ${model.summary} ${model.story} ${model.useWhen} ${model.providerName} ${model.modelId}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
  const selectedId = visible.some((model) => model.modelId === pickedId)
    ? pickedId
    : (visible[0]?.modelId ?? "");
  const resultCount = intl.formatMessage(pricingModelsBrowserMessages.resultCount, {
    count: visible.length,
  });

  function clearFilters() {
    setQuery("");
    setScope(initialScope);
    setJob(initialJob);
    setAccess(initialAccess);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <InputGroup className="min-w-0 flex-1">
            <InputGroupAddon>
              <MagnifyingGlassIcon aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              aria-label={searchLabel}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              type="search"
              value={query}
            />
          </InputGroup>
          <p aria-live="polite" className="text-sm text-muted-foreground tabular-nums">
            {resultCount}
          </p>
        </div>

        <FilterGroup label={scopeFilterLabel} onChange={setScope} options={scopes} value={scope} />
        <FilterGroup label={jobFilterLabel} onChange={setJob} options={jobs} value={job} />
        <FilterGroup
          label={accessFilterLabel}
          onChange={setAccess}
          options={accessOptions}
          value={access}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="hidden grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_auto] gap-4 border-b border-border bg-background px-4 py-2 text-xs text-muted-foreground sm:grid">
          <span>{columnModel}</span>
          <span>{columnHelpsWith}</span>
          <span>{columnBilling}</span>
        </div>

        {visible.length === 0 ? (
          <EmptyModels
            body={scope === initialScope ? emptyRecommendedBody : emptyBody}
            clearFiltersLabel={clearFiltersLabel}
            onClear={clearFilters}
            onShowEveryModel={scope === initialScope ? () => setScope("all") : undefined}
            showEveryModelLabel={showEveryModelLabel}
            title={scope === initialScope ? emptyRecommendedTitle : emptyTitle}
          />
        ) : (
          <ul aria-label={listLabel} className="divide-y divide-border">
            {visible.map((model) => {
              const selected = model.modelId === selectedId;
              const panelId = detailDomId(model.modelId);
              return (
                <li key={model.modelId}>
                  <button
                    aria-controls={panelId}
                    aria-expanded={selected}
                    className={cn(
                      "grid w-full gap-2 border-l-2 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/50 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4",
                      selected ? "border-l-foreground bg-muted/60" : "border-l-transparent",
                    )}
                    onClick={() => setPickedId(model.modelId)}
                    type="button"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <ProviderMark name={model.providerName} providerId={model.providerId} />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-sm font-medium text-foreground sm:text-base">
                            {model.name}
                          </span>
                          {model.highlight ? (
                            <span className="text-xs text-muted-foreground">{model.highlight}</span>
                          ) : null}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {model.providerName}
                        </span>
                      </span>
                    </span>
                    <span className="text-sm text-pretty text-muted-foreground">
                      {model.summary}
                    </span>
                    <span
                      className={cn(
                        "inline-flex h-5 w-fit items-center rounded-full px-2 text-xs font-medium",
                        model.access === "included"
                          ? "bg-foreground text-background"
                          : "border border-border text-muted-foreground",
                      )}
                    >
                      {model.billingLabel}
                    </span>
                  </button>
                  {selected ? (
                    <ModelStory
                      id={panelId}
                      model={model}
                      modelIdLabel={modelIdLabel}
                      useWhenLabel={useWhenLabel}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="max-w-3xl text-pretty text-sm text-muted-foreground">{footnote}</p>
    </div>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: string; label: string }[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      className="flex flex-wrap gap-1.5"
      onValueChange={(next) => {
        const selected = next[0];
        if (selected) onChange(selected);
      }}
      value={[value]}
    >
      {options.map((option) => (
        <Toggle
          className="h-8 rounded-full border border-transparent px-3 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none data-pressed:border-border data-pressed:bg-foreground data-pressed:text-background"
          key={option.id}
          value={option.id}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

function ProviderMark({ providerId, name }: { providerId: string; name: string }) {
  const logo = providerLogos[providerId];
  if (!logo) {
    return (
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-medium text-foreground"
      >
        {name.slice(0, 1)}
      </span>
    );
  }

  return (
    <Image
      alt=""
      aria-hidden
      className="size-7 shrink-0 rounded-full object-cover"
      height={logo.height}
      src={logo.src}
      unoptimized
      width={logo.width}
    />
  );
}

function ModelStory({
  id,
  model,
  modelIdLabel,
  useWhenLabel,
}: {
  id: string;
  model: PricingBrowserModel;
  modelIdLabel: string;
  useWhenLabel: string;
}) {
  return (
    <div
      className="border-t border-border bg-muted/30 px-4 py-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200 sm:px-5"
      id={id}
    >
      <div className="max-w-2xl">
        <p className="text-pretty text-sm leading-relaxed text-foreground sm:text-base">
          {model.story}
        </p>
        <p className="mt-4 text-xs font-medium text-muted-foreground">{useWhenLabel}</p>
        <p className="mt-1 text-pretty text-sm text-foreground">{model.useWhen}</p>
        <p className="mt-4 text-xs text-muted-foreground">
          {modelIdLabel} <span className="font-mono text-foreground">{model.modelId}</span>
        </p>
      </div>
    </div>
  );
}

function EmptyModels({
  title,
  body,
  clearFiltersLabel,
  showEveryModelLabel,
  onClear,
  onShowEveryModel,
}: {
  title: string;
  body: string;
  clearFiltersLabel: string;
  showEveryModelLabel: string;
  onClear: () => void;
  onShowEveryModel?: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 px-4 py-10">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-md text-pretty text-sm text-muted-foreground">{body}</p>
      <div className="flex flex-wrap gap-2">
        {onShowEveryModel ? (
          <Button onClick={onShowEveryModel} size="sm" type="button" variant="outline">
            {showEveryModelLabel}
          </Button>
        ) : null}
        <Button onClick={onClear} size="sm" type="button" variant="ghost">
          {clearFiltersLabel}
        </Button>
      </div>
    </div>
  );
}

function detailDomId(modelId: string): string {
  return `pricing-model-${modelId.replace(/[^a-z0-9]+/gi, "-")}`;
}
