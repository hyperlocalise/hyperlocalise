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
import type { Icon } from "@phosphor-icons/react";
import {
  EarIcon,
  FilmStripIcon,
  ImageIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  MusicNotesIcon,
  PenNibIcon,
  SparkleIcon,
  SpeakerHighIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import Image from "next/image";
import { useId, useState } from "react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/primitives/cn";

import type { PricingBrowserModel, PricingModelsSectionContent } from "./pricing-page-content";
import { pricingModelsBrowserMessages } from "./pricing-models-browser.messages";

type PricingModelsBrowserProps = Omit<PricingModelsSectionContent, "heading" | "subcopy">;

/**
 * Model creator marks. Icons in `public/images/model-providers` come from
 * `@lobehub/icons-static-svg@1.102.0` (MIT).
 */
const providerLogoIds = new Set([
  "openai",
  "anthropic",
  "gemini",
  "google",
  "bytedance",
  "black-forest-labs",
  "xai",
  "krea",
  "kuaishou",
  "alibaba",
  "minimax",
  "elevenlabs",
  "bria",
  "sync",
]);

function providerLogoSrc(providerId: string): string | null {
  if (providerId === "hyperlocalise") return "/images/logo/logomark-light-mode.svg";
  return providerLogoIds.has(providerId) ? `/images/model-providers/${providerId}.svg` : null;
}

const jobIcons: Record<string, Icon> = {
  all: SquaresFourIcon,
  write: PenNibIcon,
  speak: SpeakerHighIcon,
  listen: EarIcon,
  picture: ImageIcon,
  video: FilmStripIcon,
  sound: MusicNotesIcon,
};

const initialScope = "recommended";
const everyScope = "all";
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
  useWhenLabel,
  modelIdLabel,
  irisModelIdLabel,
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
  const detailId = useId();
  const isMobile = useIsMobile();
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
  const selected = visible.find((model) => model.modelId === pickedId) ?? visible[0] ?? null;
  const resultCount = intl.formatMessage(pricingModelsBrowserMessages.resultCount, {
    count: visible.length,
  });
  const everyScopeLabel = scopes.find((option) => option.id === everyScope)?.label ?? "";

  function clearFilters() {
    setQuery("");
    setScope(initialScope);
    setJob(initialJob);
    setAccess(initialAccess);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <ToggleGroup
            aria-label={jobFilterLabel}
            className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:overflow-visible lg:px-0 lg:pb-0"
            onValueChange={(next) => {
              const value = next[0];
              if (value) setJob(value);
            }}
            value={[job]}
          >
            {jobs.map((option) => {
              const JobIcon = jobIcons[option.id] ?? SparkleIcon;
              return (
                <Toggle
                  className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-transparent px-3 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none data-pressed:border-primary/25 data-pressed:bg-primary/[0.07] data-pressed:text-primary"
                  key={option.id}
                  value={option.id}
                >
                  <JobIcon aria-hidden className="size-4" weight="duotone" />
                  {option.label}
                </Toggle>
              );
            })}
          </ToggleGroup>

          <InputGroup className="w-full lg:w-64">
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
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-border py-3 text-sm">
          <ToggleGroup
            aria-label={accessFilterLabel}
            className="flex flex-wrap items-center gap-1"
            onValueChange={(next) => {
              const value = next[0];
              if (value) setAccess(value);
            }}
            value={[access]}
          >
            {accessOptions.map((option) => (
              <Toggle
                className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none data-pressed:bg-muted data-pressed:font-medium data-pressed:text-foreground"
                key={option.id}
                value={option.id}
              >
                {option.id === "included" ? (
                  <SparkleIcon aria-hidden className="size-3.5 text-primary" weight="fill" />
                ) : option.id === "byok" ? (
                  <KeyIcon aria-hidden className="size-3.5" weight="duotone" />
                ) : null}
                {option.label}
              </Toggle>
            ))}
          </ToggleGroup>

          <div className="ms-auto flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
              <Switch
                aria-label={scopeFilterLabel}
                checked={scope === everyScope}
                onCheckedChange={(checked) => setScope(checked ? everyScope : initialScope)}
                size="sm"
              />
              {everyScopeLabel}
            </label>
            <p aria-live="polite" className="text-muted-foreground tabular-nums">
              {resultCount}
            </p>
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border">
          <EmptyModels
            body={scope === initialScope ? emptyRecommendedBody : emptyBody}
            clearFiltersLabel={clearFiltersLabel}
            onClear={clearFilters}
            onShowEveryModel={scope === initialScope ? () => setScope(everyScope) : undefined}
            showEveryModelLabel={showEveryModelLabel}
            title={scope === initialScope ? emptyRecommendedTitle : emptyTitle}
          />
        </div>
      ) : (
        <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_20rem] lg:grid-cols-[minmax(0,1fr)_22rem]">
          <ul aria-label={listLabel} className="grid gap-3 lg:grid-cols-2">
            {visible.map((model) => {
              const isSelected = model.modelId === selected?.modelId;
              const JobIcon = jobIcons[model.job] ?? SparkleIcon;
              return (
                <li key={model.modelId} className="flex flex-col gap-3">
                  <button
                    aria-controls={detailId}
                    aria-expanded={isSelected}
                    className={cn(
                      "group flex w-full flex-col gap-4 lg:h-full rounded-xl border bg-background p-4 text-left transition-[border-color,box-shadow,background-color] duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                      isSelected
                        ? "border-primary/50 bg-[color-mix(in_oklab,var(--primary)_4%,var(--background))] shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_30%,transparent)]"
                        : "border-border hover:border-foreground/20 hover:shadow-[0_6px_20px_-12px_rgba(0,0,0,0.25)]",
                    )}
                    onClick={() => setPickedId(model.modelId)}
                    type="button"
                  >
                    <span className="flex w-full items-start gap-3">
                      <ProviderMark name={model.providerName} providerId={model.providerId} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-sm font-semibold text-foreground">
                            {model.name}
                          </span>
                          {model.highlight ? (
                            <span className="text-xs font-medium text-primary">
                              {model.highlight}
                            </span>
                          ) : null}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {model.providerName}
                        </span>
                      </span>
                      <JobIcon
                        aria-hidden
                        className="size-4.5 shrink-0 text-primary"
                        weight="duotone"
                      />
                    </span>
                    <span className="text-sm text-pretty text-muted-foreground">
                      {model.summary}
                    </span>
                    <BillingBadge model={model} />
                  </button>
                  {isMobile && isSelected ? (
                    <ModelDetail
                      id={detailId}
                      model={model}
                      modelIdLabel={model.surface === "iris" ? irisModelIdLabel : modelIdLabel}
                      useWhenLabel={useWhenLabel}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>

          {selected && !isMobile ? (
            <ModelDetail
              id={detailId}
              model={selected}
              modelIdLabel={selected.surface === "iris" ? irisModelIdLabel : modelIdLabel}
              useWhenLabel={useWhenLabel}
            />
          ) : null}
        </div>
      )}

      <p className="max-w-3xl text-pretty text-sm text-muted-foreground">{footnote}</p>
    </div>
  );
}

function BillingBadge({ model }: { model: PricingBrowserModel }) {
  const included = model.access === "included";
  return (
    <span
      className={cn(
        "mt-auto inline-flex h-6 w-fit items-center gap-1.5 rounded-md px-2 text-xs font-medium",
        included ? "bg-primary/10 text-primary" : "border border-border text-muted-foreground",
      )}
    >
      {included ? (
        <SparkleIcon aria-hidden className="size-3" weight="fill" />
      ) : (
        <KeyIcon aria-hidden className="size-3" weight="duotone" />
      )}
      {model.billingLabel}
    </span>
  );
}

function ProviderMark({ providerId, name }: { providerId: string; name: string }) {
  const src = providerLogoSrc(providerId);
  if (!src) {
    return (
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-medium text-foreground"
      >
        {name.slice(0, 1)}
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-white"
    >
      <Image
        alt=""
        className="size-[1.125rem] object-contain"
        height={18}
        src={src}
        unoptimized
        width={18}
      />
    </span>
  );
}

function ModelDetail({
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
  const JobIcon = jobIcons[model.job] ?? SparkleIcon;
  return (
    <aside
      aria-live="polite"
      className="relative isolate overflow-hidden rounded-2xl border border-border bg-background p-6 md:sticky md:top-24"
      id={id}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-3 -z-10 h-24"
        style={{
          backgroundImage:
            "radial-gradient(color-mix(in oklab, var(--primary) 20%, transparent) 1px, transparent 1px)",
          backgroundSize: "12px 12px",
          maskImage: "radial-gradient(ellipse at top right, black, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at top right, black, transparent 70%)",
        }}
      />
      <div
        className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200"
        key={model.modelId}
      >
        <div className="flex items-center justify-between gap-3">
          <ProviderMark name={model.providerName} providerId={model.providerId} />
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <JobIcon aria-hidden className="size-4" weight="duotone" />
          </span>
        </div>
        <p className="mt-4 text-lg font-semibold text-foreground">{model.name}</p>
        <p className="text-sm text-muted-foreground">{model.providerName}</p>
        <p className="mt-4 text-pretty text-sm leading-relaxed text-foreground">{model.story}</p>
        <div className="mt-5 rounded-lg bg-muted/50 p-3">
          <p className="text-xs font-medium text-muted-foreground">{useWhenLabel}</p>
          <p className="mt-1 text-pretty text-sm text-foreground">{model.useWhen}</p>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <BillingBadge model={model} />
          <p className="text-xs text-muted-foreground">
            {modelIdLabel} <span className="font-mono text-foreground">{model.modelId}</span>
          </p>
        </div>
      </div>
    </aside>
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
    <div className="flex flex-col items-start gap-3 px-6 py-10">
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
