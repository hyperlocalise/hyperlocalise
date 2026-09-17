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
import { type FormEvent, useEffect, useId, useState } from "react";
import {
  CheckmarkCircle02Icon,
  Copy01Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useIntl } from "react-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DOMAIN_RESEARCH_MARKETS,
  type DomainResearchDomain,
} from "@/lib/domains/research-prototype";
import { apiClient } from "@/lib/api-client-instance";
import type { LinkedDomainVerificationMethod } from "@/lib/database/schema/linked-domains";
import type { LinkedDomainPublic } from "@/lib/linked-domains/types";
import { cn } from "@/lib/primitives/cn";

import { addDomainDialogMessages as messages } from "./add-domain-dialog.messages";

type Project = { id: string; name: string };
type Step = "details" | "project" | "connect" | "markets";
type MarketRecommendation = {
  marketId: string;
  organicCount: number;
  organicEtv: number;
  top10Count: number;
  hasOrganicVisibility: boolean;
};
type MarketTier = "strong" | "emerging" | "discovery";
type ApiErrorBody = { error?: string; message?: string };

function getApiErrorMessage(body: ApiErrorBody, fallback: string) {
  return body.message || body.error || fallback;
}

function getMarketTier(market: MarketRecommendation): MarketTier {
  if (market.top10Count >= 10) return "strong";
  if (market.organicCount > 0 || market.organicEtv > 0 || market.hasOrganicVisibility) {
    return "emerging";
  }
  return "discovery";
}

function emptyMarketRecommendation(marketId: string): MarketRecommendation {
  return {
    marketId,
    organicCount: 0,
    organicEtv: 0,
    top10Count: 0,
    hasOrganicVisibility: false,
  };
}

const supportedMarketRecommendations = DOMAIN_RESEARCH_MARKETS.map((market) =>
  emptyMarketRecommendation(market.id),
);
const MAX_MARKET_SELECTIONS = 16;

export function AddDomainDialog({
  open,
  onOpenChange,
  organizationSlug,
  initialDomainSlug,
  mode = "create",
  initialStep = "details",
  initialLinkedDomain,
  initialRecommendations = [],
  initialSelectedMarketIds = [],
  existingDomains = [],
  projects = [],
  projectsLoading = false,
  onComplete,
  onVerified,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  initialDomainSlug?: string;
  mode?: "create" | "edit";
  initialStep?: Step;
  initialLinkedDomain?: LinkedDomainPublic;
  initialRecommendations?: MarketRecommendation[];
  initialSelectedMarketIds?: string[];
  existingDomains?: DomainResearchDomain[];
  projects?: Project[];
  projectsLoading?: boolean;
  onComplete?: (domain: LinkedDomainPublic) => void;
  onVerified?: (domain: LinkedDomainPublic) => void;
}) {
  const intl = useIntl();
  const domainId = useId();
  const [step, setStep] = useState<Step>(initialStep);
  const [domain, setDomain] = useState(initialLinkedDomain?.domainKey ?? "");
  const [claimDomainSlug, setClaimDomainSlug] = useState(initialDomainSlug ?? null);
  const [linkedDomain, setLinkedDomain] = useState<LinkedDomainPublic | null>(
    initialLinkedDomain ?? null,
  );
  const [projectMode, setProjectMode] = useState<"create" | "existing" | "unassigned">("create");
  const [projectId, setProjectId] = useState("");
  const [method, setMethod] = useState<LinkedDomainVerificationMethod>("dns_txt");
  const [recommendations, setRecommendations] =
    useState<MarketRecommendation[]>(initialRecommendations);
  const [selectedMarketIds, setSelectedMarketIds] = useState<string[]>(initialSelectedMarketIds);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const allowsEmptyMarkets = Boolean(claimDomainSlug || linkedDomain?.localisationAuditId);

  useEffect(() => {
    if (!open) return;
    setStep(initialStep);
    setDomain(initialLinkedDomain?.domainKey ?? "");
    setClaimDomainSlug(initialDomainSlug ?? null);
    setLinkedDomain(initialLinkedDomain ?? null);
    setMethod("dns_txt");
    setProjectMode("create");
    setProjectId("");
    setRecommendations(
      initialRecommendations.length || mode !== "edit"
        ? initialRecommendations
        : supportedMarketRecommendations,
    );
    setSelectedMarketIds(
      initialSelectedMarketIds.length || !initialLinkedDomain
        ? initialSelectedMarketIds
        : initialLinkedDomain.marketIds,
    );
    setPending(false);
    setError(null);
    setCopied(false);
    if (initialDomainSlug) void startClaimRequest({ domainSlug: initialDomainSlug });
  }, [open]);

  function close() {
    if (!pending) onOpenChange(false);
  }

  async function startClaimRequest(input: { domain?: string; domainSlug?: string }) {
    const normalized = input.domain
      ?.trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    if (
      !input.domainSlug &&
      (!normalized ||
        !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(normalized))
    ) {
      setError(intl.formatMessage(messages.invalidDomain));
      return;
    }
    if (
      normalized &&
      existingDomains.some((item) => item.domainKey === normalized && item.status === "verified")
    ) {
      setError(intl.formatMessage(messages.duplicateDomain));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await apiClient.api.orgs[":organizationSlug"]["linked-domains"].$post({
        param: { organizationSlug },
        json: {
          ...(input.domainSlug ? { domainSlug: input.domainSlug } : { domain: normalized }),
          marketIds: [],
        },
      });
      if (response.status !== 201) {
        const body = await response.json();
        throw new Error(getApiErrorMessage(body, intl.formatMessage(messages.startError)));
      }
      const body = await response.json();
      setDomain(body.linkedDomain.domainKey);
      setLinkedDomain(body.linkedDomain);
      if (body.linkedDomain.status === "verified") {
        onVerified?.(body.linkedDomain);
        onOpenChange(false);
        return;
      }
      setStep("connect");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : intl.formatMessage(messages.startError));
    } finally {
      setPending(false);
    }
  }

  async function startClaim(event: FormEvent) {
    event.preventDefault();
    await startClaimRequest(claimDomainSlug ? { domainSlug: claimDomainSlug } : { domain });
  }

  async function copyRecord() {
    if (!linkedDomain) return;
    const value =
      method === "dns_txt"
        ? linkedDomain.challenges.dnsTxt.value
        : method === "html_file"
          ? linkedDomain.challenges.htmlFile.body
          : linkedDomain.challenges.metaTag.html;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* best effort */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function loadRecommendations() {
    if (!linkedDomain) return;
    setPending(true);
    setError(null);
    try {
      const response = await apiClient.api.orgs[":organizationSlug"]["linked-domains"][
        ":linkedDomainId"
      ]["market-recommendations"].$post({
        param: { organizationSlug, linkedDomainId: linkedDomain.id },
        json: { method },
      });
      if (response.status !== 200) {
        const body = await response.json();
        setRecommendations(supportedMarketRecommendations);
        setStep("markets");
        throw new Error(
          getApiErrorMessage(body, intl.formatMessage(messages.recommendationsError)),
        );
      }
      const body = await response.json();
      setStep("markets");
      const candidates = body.marketRecommendations.candidates ?? [];
      const candidatesById = new Map(candidates.map((market) => [market.marketId, market]));
      const supportedMarkets = DOMAIN_RESEARCH_MARKETS.map(
        (market): MarketRecommendation =>
          candidatesById.get(market.id) ?? emptyMarketRecommendation(market.id),
      );
      setRecommendations(supportedMarkets);
      setSelectedMarketIds(
        (body.marketRecommendations.recommended ?? []).map((market) => market.marketId),
      );
    } catch (reason) {
      setRecommendations((current) =>
        current.length > 0 ? current : supportedMarketRecommendations,
      );
      setError(
        reason instanceof Error
          ? reason.message
          : intl.formatMessage(messages.recommendationsError),
      );
    } finally {
      setPending(false);
    }
  }

  async function saveMarkets() {
    if (!linkedDomain) return;
    if (selectedMarketIds.length === 0 && !allowsEmptyMarkets) {
      setError(intl.formatMessage(messages.marketSelectionRequired));
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (mode === "edit") {
        const response = await apiClient.api.orgs[":organizationSlug"]["linked-domains"][
          ":linkedDomainId"
        ].markets.$patch({
          param: { organizationSlug, linkedDomainId: linkedDomain.id },
          json: { marketIds: selectedMarketIds },
        });
        if (response.status !== 200) {
          const body = await response.json();
          throw new Error(getApiErrorMessage(body, intl.formatMessage(messages.saveMarketsError)));
        }
        const body = await response.json();
        onComplete?.(body.linkedDomain);
        onOpenChange(false);
        return;
      }

      let selectedProjectId: string | undefined;
      let createProject: boolean | undefined;
      if (projectMode === "existing") {
        if (!projectId) throw new Error(intl.formatMessage(messages.selectProjectError));
        selectedProjectId = projectId;
      } else if (projectMode === "create") {
        createProject = true;
      } else {
        createProject = false;
      }

      const response = await apiClient.api.orgs[":organizationSlug"]["linked-domains"][
        ":linkedDomainId"
      ].verify.$post({
        param: { organizationSlug, linkedDomainId: linkedDomain.id },
        json: {
          method,
          ...(selectedProjectId ? { projectId: selectedProjectId } : { createProject }),
          marketIds: selectedMarketIds,
        },
      });
      if (response.status !== 200) {
        const body = await response.json();
        throw new Error(getApiErrorMessage(body, intl.formatMessage(messages.verifyError)));
      }
      const body = await response.json();
      onComplete?.(body.linkedDomain);
      onOpenChange(false);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : intl.formatMessage(messages.saveMarketsError),
      );
    } finally {
      setPending(false);
    }
  }

  const record = linkedDomain?.challenges.dnsTxt;
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[min(90vh,760px)] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={startClaim} className="grid gap-6">
          <DialogHeader>
            <DialogTitle>{intl.formatMessage(messages.title)}</DialogTitle>
            <DialogDescription>{intl.formatMessage(messages.description)}</DialogDescription>
          </DialogHeader>
          <ol
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            aria-label={intl.formatMessage(messages.title)}
          >
            {(["details", "connect", "markets", "project"] as const).map((item, index) => {
              const labels = [
                messages.detailsStep,
                messages.connectStep,
                messages.marketsStep,
                messages.projectStep,
              ];
              const active = step === item;
              const complete = ["details", "connect", "markets", "project"].indexOf(step) > index;
              return (
                <li
                  key={item}
                  aria-current={active ? "step" : undefined}
                  data-state={complete ? "complete" : active ? "current" : "upcoming"}
                  className={cn(
                    "flex items-center gap-2 border-b-2 pb-2 text-xs font-medium transition-colors",
                    complete && "border-primary/50 text-primary",
                    active && "border-primary text-foreground",
                    !active && !complete && "border-border text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                      complete && "border-primary bg-primary text-primary-foreground",
                      active && "border-primary bg-primary/10 text-primary",
                      !active && !complete && "border-border bg-muted/40 text-muted-foreground",
                    )}
                  >
                    {complete ? (
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="truncate">{intl.formatMessage(labels[index]!)}</span>
                  {active ? (
                    <span className="sr-only">{intl.formatMessage(messages.currentStep)}</span>
                  ) : null}
                  {complete ? (
                    <span className="sr-only">{intl.formatMessage(messages.completedStep)}</span>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {error ? (
            <Alert variant="destructive">
              <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={1.8} />
              <AlertTitle>{intl.formatMessage(messages.errorTitle)}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {step === "details" ? (
            <>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor={domainId}>
                  {intl.formatMessage(messages.domainLabel)}
                </FieldLabel>
                <Input
                  id={domainId}
                  value={domain}
                  onChange={(event) => {
                    setDomain(event.target.value);
                    setError(null);
                  }}
                  placeholder={intl.formatMessage(messages.domainPlaceholder)}
                  autoComplete="url"
                  aria-invalid={Boolean(error)}
                />
                <FieldDescription>
                  {intl.formatMessage(messages.domainDescription)}
                </FieldDescription>
                {error ? <FieldError>{error}</FieldError> : null}
              </Field>
              <DialogFooter>
                <Button type="submit" disabled={pending || !domain.trim()}>
                  {pending
                    ? intl.formatMessage(messages.preparing)
                    : intl.formatMessage(messages.continue)}
                </Button>
              </DialogFooter>
            </>
          ) : null}
          {step === "connect" && linkedDomain && record ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold">
                    {intl.formatMessage(messages.verifyDomain, { domain: linkedDomain.domainKey })}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {intl.formatMessage(messages.verifyDescription)}
                  </p>
                </div>
                <Badge variant="secondary">{intl.formatMessage(messages.pending)}</Badge>
              </div>
              <FieldSet className="grid gap-3">
                <FieldLegend variant="label">
                  {intl.formatMessage(messages.verificationMethod)}
                </FieldLegend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      ["dns_txt", messages.dnsTxt, messages.dnsTxtDescription, true],
                      ["html_file", messages.htmlFile, messages.htmlFileDescription, false],
                      ["meta_tag", messages.metaTag, messages.metaTagDescription, false],
                    ] as const
                  ).map(([value, label, description, recommended]) => (
                    <Button
                      key={value}
                      type="button"
                      variant={method === value ? "default" : "outline"}
                      aria-pressed={method === value}
                      className="h-auto min-h-16 justify-start whitespace-normal px-3 py-2 text-start"
                      onClick={() => {
                        setMethod(value);
                        setCopied(false);
                        setError(null);
                      }}
                    >
                      <span className="grid gap-0.5">
                        <span className="flex items-center gap-2">
                          <span>{intl.formatMessage(label)}</span>
                          {recommended ? (
                            <Badge variant="secondary" className="text-[10px]">
                              {intl.formatMessage(messages.recommended)}
                            </Badge>
                          ) : null}
                        </span>
                        <span className="text-xs font-normal opacity-75">
                          {intl.formatMessage(description)}
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
              </FieldSet>
              {method === "dns_txt" ? (
                <dl className="grid gap-4 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                  <div className="grid gap-1 sm:grid-cols-[5rem_1fr]">
                    <dt className="text-muted-foreground">{intl.formatMessage(messages.host)}</dt>
                    <dd className="font-mono">{record.host}</dd>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-[5rem_1fr]">
                    <dt className="text-muted-foreground">{intl.formatMessage(messages.type)}</dt>
                    <dd className="font-mono">TXT</dd>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-[5rem_1fr] sm:items-center">
                    <dt className="text-muted-foreground">{intl.formatMessage(messages.value)}</dt>
                    <dd className="flex min-w-0 items-center gap-2">
                      <code className="truncate font-mono">{record.value}</code>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        aria-label={intl.formatMessage(messages.copyTxt)}
                        onClick={() => void copyRecord()}
                      >
                        <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.8} />
                      </Button>
                    </dd>
                  </div>
                </dl>
              ) : method === "html_file" ? (
                <dl className="grid gap-4 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                  <div className="grid gap-1 sm:grid-cols-[5rem_1fr]">
                    <dt className="text-muted-foreground">{intl.formatMessage(messages.path)}</dt>
                    <dd className="font-mono">{linkedDomain.challenges.htmlFile.path}</dd>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-[5rem_1fr] sm:items-center">
                    <dt className="text-muted-foreground">
                      {intl.formatMessage(messages.contents)}
                    </dt>
                    <dd className="flex min-w-0 items-center gap-2">
                      <code className="truncate font-mono">
                        {linkedDomain.challenges.htmlFile.body}
                      </code>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        aria-label={intl.formatMessage(messages.copyFile)}
                        onClick={() => void copyRecord()}
                      >
                        <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.8} />
                      </Button>
                    </dd>
                  </div>
                </dl>
              ) : (
                <div className="grid gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                  <p>{intl.formatMessage(messages.metaInstruction)}</p>
                  <div className="flex min-w-0 items-center gap-2 rounded-md bg-background p-2">
                    <code className="min-w-0 flex-1 truncate font-mono">
                      {linkedDomain.challenges.metaTag.html}
                    </code>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      aria-label={intl.formatMessage(messages.copyMeta)}
                      onClick={() => void copyRecord()}
                    >
                      <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.8} />
                    </Button>
                  </div>
                </div>
              )}
              <p role="status" className="text-sm text-muted-foreground">
                {copied
                  ? intl.formatMessage(messages.copied)
                  : method === "dns_txt"
                    ? intl.formatMessage(messages.dnsPropagation)
                    : method === "html_file"
                      ? intl.formatMessage(messages.fileReachable)
                      : intl.formatMessage(messages.homepageReachable)}
              </p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setStep("details")}>
                  {intl.formatMessage(messages.back)}
                </Button>
                <Button type="button" disabled={pending} onClick={() => void loadRecommendations()}>
                  {pending
                    ? intl.formatMessage(messages.findingMarkets)
                    : intl.formatMessage(messages.continue)}
                </Button>
              </DialogFooter>
            </>
          ) : null}
          {step === "markets" ? (
            <>
              <div>
                <h3 className="font-semibold">{intl.formatMessage(messages.marketsTitle)}</h3>
                <p className="text-sm text-muted-foreground">
                  {intl.formatMessage(messages.marketsDescription, { domain })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {intl.formatMessage(messages.dataForSeo)}
                </p>
              </div>
              {pending && !recommendations.length ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {intl.formatMessage(messages.findingMarkets)}
                </p>
              ) : recommendations.length ? (
                <div className="grid gap-3">
                  {recommendations.map((market) =>
                    (() => {
                      const tier = getMarketTier(market);
                      const selected = selectedMarketIds.includes(market.marketId);
                      const tierLabel =
                        tier === "strong"
                          ? intl.formatMessage(messages.strongSignal)
                          : tier === "emerging"
                            ? intl.formatMessage(messages.emergingSignal)
                            : intl.formatMessage(messages.newOpportunity);
                      return (
                        <label
                          key={market.marketId}
                          className={cn(
                            "flex items-start gap-3 rounded-lg border border-l-4 p-3 transition-colors",
                            selected
                              ? "border-border bg-muted text-foreground"
                              : "border-border bg-background",
                            tier === "strong" && "border-l-emerald-500 dark:border-l-emerald-400",
                            tier === "emerging" && "border-l-amber-500 dark:border-l-amber-400",
                            tier === "discovery" && "border-l-slate-300 dark:border-l-slate-600",
                          )}
                        >
                          <Checkbox
                            checked={selectedMarketIds.includes(market.marketId)}
                            disabled={
                              !selected && selectedMarketIds.length >= MAX_MARKET_SELECTIONS
                            }
                            onCheckedChange={(checked) =>
                              setSelectedMarketIds((current) =>
                                checked
                                  ? [...current, market.marketId]
                                  : current.filter((id) => id !== market.marketId),
                              )
                            }
                          />
                          <span className="grid gap-1 text-sm">
                            <span className="flex items-center justify-between gap-3 font-medium">
                              <span>
                                {DOMAIN_RESEARCH_MARKETS.find((item) => item.id === market.marketId)
                                  ?.label ?? market.marketId.replaceAll("-", " ")}
                              </span>
                              <span className="text-xs font-medium text-muted-foreground">
                                {tierLabel}
                              </span>
                            </span>
                            <span className="text-muted-foreground">
                              {intl.formatMessage(messages.rankingKeywords, {
                                count: market.organicCount.toLocaleString(),
                              })}
                              {" · "}
                              {intl.formatMessage(messages.estimatedVisits, {
                                count: market.organicEtv.toLocaleString(undefined, {
                                  maximumFractionDigits: 0,
                                }),
                              })}
                              {" · "}
                              {intl.formatMessage(messages.topTen, { count: market.top10Count })}
                            </span>
                          </span>
                        </label>
                      );
                    })(),
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {intl.formatMessage(messages.noRecommendations)}
                </p>
              )}
              {selectedMarketIds.length >= MAX_MARKET_SELECTIONS ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {intl.formatMessage(messages.marketSelectionLimit)}
                </p>
              ) : null}
              {selectedMarketIds.length === 0 && !allowsEmptyMarkets ? (
                <p role="alert" className="text-sm text-destructive">
                  {intl.formatMessage(messages.marketSelectionRequired)}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setStep("connect")}>
                  {intl.formatMessage(messages.back)}
                </Button>
                <Button
                  type="button"
                  disabled={pending || (selectedMarketIds.length === 0 && !allowsEmptyMarkets)}
                  onClick={() => setStep("project")}
                >
                  {intl.formatMessage(messages.continueToProject)}
                </Button>
              </DialogFooter>
            </>
          ) : null}
          {step === "project" ? (
            <>
              <div>
                <h3 className="font-semibold">{intl.formatMessage(messages.projectTitle)}</h3>
                <p className="text-sm text-muted-foreground">
                  {intl.formatMessage(messages.projectDescription, { domain })}
                </p>
              </div>
              <FieldSet className="grid gap-3">
                <FieldLegend variant="label">
                  {intl.formatMessage(messages.projectAttachment)}
                </FieldLegend>
                <p className="text-sm text-muted-foreground">
                  {intl.formatMessage(messages.lastStep)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={projectMode === "create" ? "default" : "outline"}
                    aria-pressed={projectMode === "create"}
                    className="h-auto min-h-16 flex-1 justify-start whitespace-normal px-3 py-3 text-start sm:min-w-44"
                    onClick={() => {
                      setProjectMode("create");
                      setError(null);
                    }}
                  >
                    <span className="grid gap-0.5">
                      <span>{intl.formatMessage(messages.createProject)}</span>
                      <span className="text-xs font-normal opacity-75">
                        {intl.formatMessage(messages.namedAfterDomain)}
                      </span>
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant={projectMode === "existing" ? "default" : "outline"}
                    disabled={projectsLoading || projects.length === 0}
                    aria-pressed={projectMode === "existing"}
                    className="h-auto min-h-16 flex-1 justify-start whitespace-normal px-3 py-3 text-start sm:min-w-44"
                    onClick={() => {
                      setProjectMode("existing");
                      setError(null);
                    }}
                  >
                    <span className="grid gap-0.5">
                      <span>{intl.formatMessage(messages.existingProject)}</span>
                      <span className="text-xs font-normal opacity-75">
                        {projectsLoading
                          ? intl.formatMessage(messages.loadingProjects)
                          : projects.length
                            ? intl.formatMessage(messages.availableProjects, {
                                count: projects.length,
                              })
                            : intl.formatMessage(messages.noProjects)}
                      </span>
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant={projectMode === "unassigned" ? "default" : "outline"}
                    aria-pressed={projectMode === "unassigned"}
                    className="h-auto min-h-16 flex-1 justify-start whitespace-normal px-3 py-3 text-start sm:min-w-44"
                    onClick={() => {
                      setProjectMode("unassigned");
                      setError(null);
                    }}
                  >
                    <span className="grid gap-0.5">
                      <span>{intl.formatMessage(messages.leaveUnassigned)}</span>
                      <span className="text-xs font-normal opacity-75">
                        {intl.formatMessage(messages.assignLater)}
                      </span>
                    </span>
                  </Button>
                </div>
                {projectMode === "existing" ? (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={`${domainId}-project`}>
                      {intl.formatMessage(messages.existingProject)}
                    </FieldLabel>
                    <select
                      id={`${domainId}-project`}
                      aria-label="Existing project"
                      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                      value={projectId}
                      onChange={(event) => {
                        setProjectId(event.target.value);
                        setError(null);
                      }}
                    >
                      <option value="">{intl.formatMessage(messages.selectExisting)}</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                    {error ? <FieldError>{error}</FieldError> : null}
                  </Field>
                ) : null}
              </FieldSet>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setStep("markets")}>
                  {intl.formatMessage(messages.back)}
                </Button>
                <Button
                  type="button"
                  disabled={pending || (selectedMarketIds.length === 0 && !allowsEmptyMarkets)}
                  onClick={() => void saveMarkets()}
                >
                  {pending
                    ? intl.formatMessage(messages.finishing)
                    : intl.formatMessage(
                        mode === "edit"
                          ? messages.saveSelectedMarkets
                          : messages.addSelectedMarkets,
                      )}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
