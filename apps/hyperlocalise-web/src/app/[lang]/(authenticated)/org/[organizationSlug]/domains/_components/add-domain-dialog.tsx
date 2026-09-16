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
import type { DomainResearchDomain } from "@/lib/domains/research-prototype";
import type { LinkedDomainVerificationMethod } from "@/lib/database/schema/linked-domains";
import type { LinkedDomainPublic } from "@/lib/linked-domains/types";
import { cn } from "@/lib/primitives/cn";

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

export function AddDomainDialog({
  open,
  onOpenChange,
  organizationSlug,
  initialDomainSlug,
  initialStep = "details",
  initialLinkedDomain,
  initialRecommendations = [],
  initialSelectedMarketIds = [],
  existingDomains = [],
  projects = [],
  projectsLoading = false,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  initialDomainSlug?: string;
  initialStep?: Step;
  initialLinkedDomain?: LinkedDomainPublic;
  initialRecommendations?: MarketRecommendation[];
  initialSelectedMarketIds?: string[];
  existingDomains?: DomainResearchDomain[];
  projects?: Project[];
  projectsLoading?: boolean;
  onComplete?: (domain: LinkedDomainPublic) => void;
}) {
  const domainId = useId();
  const [step, setStep] = useState<Step>(initialStep);
  const [domain, setDomain] = useState(initialLinkedDomain?.domainKey ?? "");
  const [linkedDomain, setLinkedDomain] = useState<LinkedDomainPublic | null>(
    initialLinkedDomain ?? null,
  );
  const [projectMode, setProjectMode] = useState<"create" | "existing" | "unassigned">("create");
  const [projectId, setProjectId] = useState("");
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [method, setMethod] = useState<LinkedDomainVerificationMethod>("dns_txt");
  const [recommendations, setRecommendations] =
    useState<MarketRecommendation[]>(initialRecommendations);
  const [selectedMarketIds, setSelectedMarketIds] = useState<string[]>(initialSelectedMarketIds);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(initialStep);
    setDomain(initialLinkedDomain?.domainKey ?? "");
    setLinkedDomain(initialLinkedDomain ?? null);
    setMethod("dns_txt");
    setProjectMode("create");
    setProjectId("");
    setCreatedProjectId(null);
    setRecommendations(initialRecommendations);
    setSelectedMarketIds(initialSelectedMarketIds);
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
      setError("Enter a valid domain, like example.com.");
      return;
    }
    if (
      normalized &&
      existingDomains.some(
        (item) => item.domainKey === normalized && item.status !== "pending_verification",
      )
    ) {
      setError("This domain is already linked. Edit its research markets instead.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(input.domainSlug ? { domainSlug: input.domainSlug } : { domain: normalized }),
            marketIds: [],
          }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as ApiErrorBody & {
        linkedDomain?: LinkedDomainPublic;
      };
      if (!response.ok || !body.linkedDomain)
        throw new Error(getApiErrorMessage(body, "Could not start domain setup."));
      setDomain(body.linkedDomain.domainKey);
      setLinkedDomain(body.linkedDomain);
      setStep("connect");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start domain setup.");
    } finally {
      setPending(false);
    }
  }

  async function startClaim(event: FormEvent) {
    event.preventDefault();
    await startClaimRequest({ domain });
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

  async function verify() {
    if (!linkedDomain) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${linkedDomain.id}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method, createProject: false }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        linkedDomain?: LinkedDomainPublic;
        message?: string;
      };
      if (!response.ok || !body.linkedDomain)
        throw new Error(body.message || "Verification failed.");
      setLinkedDomain(body.linkedDomain);
      setStep("markets");
      const recommendationResponse = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${body.linkedDomain.id}/market-recommendations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const recommendationBody = (await recommendationResponse.json().catch(() => ({}))) as {
        marketRecommendations?: {
          candidates?: MarketRecommendation[];
          recommended?: MarketRecommendation[];
        };
        message?: string;
      };
      if (!recommendationResponse.ok || !recommendationBody.marketRecommendations)
        throw new Error(recommendationBody.message || "Could not load market recommendations.");
      const candidates = recommendationBody.marketRecommendations.candidates ?? [];
      setRecommendations(candidates);
      setSelectedMarketIds(
        (recommendationBody.marketRecommendations.recommended ?? []).map(
          (market) => market.marketId,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Verification failed.");
    } finally {
      setPending(false);
    }
  }

  async function saveMarkets() {
    if (!linkedDomain) return;
    setPending(true);
    setError(null);
    try {
      let selectedProjectId: string | null = null;
      if (projectMode === "existing") {
        if (!projectId) throw new Error("Select a project to continue.");
        selectedProjectId = projectId;
      } else if (projectMode === "create") {
        if (createdProjectId) {
          selectedProjectId = createdProjectId;
        } else {
          const projectResponse = await fetch(
            `/api/orgs/${encodeURIComponent(organizationSlug)}/projects`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: linkedDomain.domainKey,
                sourceLocale: "en-US",
                targetLocales: [],
              }),
            },
          );
          const projectBody = (await projectResponse.json().catch(() => ({}))) as {
            project?: { id: string };
            message?: string;
          };
          if (!projectResponse.ok || !projectBody.project) {
            throw new Error(projectBody.message || "Could not create the project.");
          }
          selectedProjectId = projectBody.project.id;
          setCreatedProjectId(projectBody.project.id);
        }
      }

      const projectResponse = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${linkedDomain.id}/project`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: selectedProjectId }),
        },
      );
      const projectBody = (await projectResponse.json().catch(() => ({}))) as {
        linkedDomain?: LinkedDomainPublic;
        message?: string;
      };
      if (!projectResponse.ok) {
        throw new Error(projectBody.message || "Could not attach the project.");
      }

      let completedDomain = projectBody.linkedDomain;
      if (selectedMarketIds.length > 0) {
        const response = await fetch(
          `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${linkedDomain.id}/markets`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ marketIds: selectedMarketIds }),
          },
        );
        const body = (await response.json().catch(() => ({}))) as {
          linkedDomain?: LinkedDomainPublic;
          message?: string;
        };
        if (!response.ok || !body.linkedDomain)
          throw new Error(body.message || "Could not save research markets.");
        completedDomain = body.linkedDomain;
      }
      if (!completedDomain) throw new Error("Could not finish domain setup.");
      onComplete?.(completedDomain);
      onOpenChange(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save research markets.");
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
            <DialogTitle>Add a domain</DialogTitle>
            <DialogDescription>
              Connect a domain, verify ownership, and choose the markets to research.
            </DialogDescription>
          </DialogHeader>
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Domain setup progress">
            {(["details", "connect", "markets", "project"] as const).map((item, index) => {
              const labels = ["Domain details", "Connect", "Research markets", "Project"];
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
                  <span className="truncate">{labels[index]}</span>
                  {active ? <span className="sr-only">Current step</span> : null}
                  {complete ? <span className="sr-only">Completed</span> : null}
                </li>
              );
            })}
          </ol>
          {error ? (
            <Alert variant="destructive">
              <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={1.8} />
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {step === "details" ? (
            <>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor={domainId}>Domain</FieldLabel>
                <Input
                  id={domainId}
                  value={domain}
                  onChange={(event) => {
                    setDomain(event.target.value);
                    setError(null);
                  }}
                  placeholder="example.com"
                  autoComplete="url"
                  aria-invalid={Boolean(error)}
                />
                <FieldDescription>Use your root domain without a path.</FieldDescription>
                {error ? <FieldError>{error}</FieldError> : null}
              </Field>
              <DialogFooter>
                <Button type="submit" disabled={pending || !domain.trim()}>
                  {pending ? "Preparing…" : "Continue"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
          {step === "connect" && linkedDomain && record ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold">Verify {linkedDomain.domainKey}</h3>
                  <p className="text-sm text-muted-foreground">
                    Choose the verification method that works best for your site.
                  </p>
                </div>
                <Badge variant="secondary">Pending</Badge>
              </div>
              <FieldSet className="grid gap-3">
                <FieldLegend variant="label">Verification method</FieldLegend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      ["dns_txt", "DNS TXT", "Best for most domains.", true],
                      ["html_file", "HTML file", "Upload a verification file.", false],
                      ["meta_tag", "Meta tag", "Add a tag to your homepage.", false],
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
                          <span>{label}</span>
                          {recommended ? (
                            <Badge variant="secondary" className="text-[10px]">
                              Recommended
                            </Badge>
                          ) : null}
                        </span>
                        <span className="text-xs font-normal opacity-75">{description}</span>
                      </span>
                    </Button>
                  ))}
                </div>
              </FieldSet>
              {method === "dns_txt" ? (
                <dl className="grid gap-4 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                  <div className="grid gap-1 sm:grid-cols-[5rem_1fr]">
                    <dt className="text-muted-foreground">Host</dt>
                    <dd className="font-mono">{record.host}</dd>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-[5rem_1fr]">
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="font-mono">TXT</dd>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-[5rem_1fr] sm:items-center">
                    <dt className="text-muted-foreground">Value</dt>
                    <dd className="flex min-w-0 items-center gap-2">
                      <code className="truncate font-mono">{record.value}</code>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        aria-label="Copy TXT value"
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
                    <dt className="text-muted-foreground">Path</dt>
                    <dd className="font-mono">{linkedDomain.challenges.htmlFile.path}</dd>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-[5rem_1fr] sm:items-center">
                    <dt className="text-muted-foreground">Contents</dt>
                    <dd className="flex min-w-0 items-center gap-2">
                      <code className="truncate font-mono">
                        {linkedDomain.challenges.htmlFile.body}
                      </code>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        aria-label="Copy verification file contents"
                        onClick={() => void copyRecord()}
                      >
                        <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.8} />
                      </Button>
                    </dd>
                  </div>
                </dl>
              ) : (
                <div className="grid gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                  <p>
                    Add this meta tag inside the homepage <code>&lt;head&gt;</code>.
                  </p>
                  <div className="flex min-w-0 items-center gap-2 rounded-md bg-background p-2">
                    <code className="min-w-0 flex-1 truncate font-mono">
                      {linkedDomain.challenges.metaTag.html}
                    </code>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      aria-label="Copy meta tag"
                      onClick={() => void copyRecord()}
                    >
                      <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.8} />
                    </Button>
                  </div>
                </div>
              )}
              <p role="status" className="text-sm text-muted-foreground">
                {copied
                  ? "Verification value copied."
                  : method === "dns_txt"
                    ? "DNS changes can take a few minutes to propagate."
                    : method === "html_file"
                      ? "The file must be publicly reachable at the exact path."
                      : "The homepage must be publicly reachable for verification."}
              </p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setStep("details")}>
                  Back
                </Button>
                <Button type="button" disabled={pending} onClick={() => void verify()}>
                  {pending ? "Verifying…" : "I’ve added it — Verify"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
          {step === "markets" ? (
            <>
              <div>
                <h3 className="font-semibold">Choose research markets</h3>
                <p className="text-sm text-muted-foreground">
                  We found these markets with the strongest signals for {domain}. You can change the
                  selection.
                </p>
                <p className="text-xs text-muted-foreground">
                  Powered by DataForSEO Labs’ Google Domain Rank Overview API.
                </p>
              </div>
              {pending && !recommendations.length ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Finding recommended markets…
                </p>
              ) : recommendations.length ? (
                <div className="grid gap-3">
                  {recommendations.map((market) =>
                    (() => {
                      const tier = getMarketTier(market);
                      const selected = selectedMarketIds.includes(market.marketId);
                      const tierLabel =
                        tier === "strong"
                          ? "Strong signal"
                          : tier === "emerging"
                            ? "Emerging signal"
                            : "New opportunity";
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
                              <span>{market.marketId.replaceAll("-", " ")}</span>
                              <span className="text-xs font-medium text-muted-foreground">
                                {tierLabel}
                              </span>
                            </span>
                            <span className="text-muted-foreground">
                              {market.organicCount.toLocaleString()} ranking keywords ·{" "}
                              {market.organicEtv.toLocaleString(undefined, {
                                maximumFractionDigits: 0,
                              })}{" "}
                              estimated visits · {market.top10Count} top-10
                            </span>
                          </span>
                        </label>
                      );
                    })(),
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No recommendations were found. You can continue with no markets and add them
                  later.
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setStep("connect")}>
                  Back
                </Button>
                <Button type="button" disabled={pending} onClick={() => setStep("project")}>
                  Continue to project
                </Button>
              </DialogFooter>
            </>
          ) : null}
          {step === "project" ? (
            <>
              <div>
                <h3 className="font-semibold">Choose a project</h3>
                <p className="text-sm text-muted-foreground">
                  Decide where {domain} should be attached after verification.
                </p>
              </div>
              <FieldSet className="grid gap-3">
                <FieldLegend variant="label">Project attachment</FieldLegend>
                <p className="text-sm text-muted-foreground">
                  This is the last step. You can change the assignment later from the domain page.
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
                      <span>Create new project</span>
                      <span className="text-xs font-normal opacity-75">
                        Named after this domain
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
                      <span>Use existing project</span>
                      <span className="text-xs font-normal opacity-75">
                        {projectsLoading
                          ? "Loading projects…"
                          : projects.length
                            ? `${projects.length} available`
                            : "No projects available"}
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
                      <span>Leave unassigned</span>
                      <span className="text-xs font-normal opacity-75">Assign it later</span>
                    </span>
                  </Button>
                </div>
                {projectMode === "existing" ? (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={`${domainId}-project`}>Existing project</FieldLabel>
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
                      <option value="">Select a project</option>
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
                  Back
                </Button>
                <Button type="button" disabled={pending} onClick={() => void saveMarkets()}>
                  {pending ? "Finishing…" : "Add selected markets"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
