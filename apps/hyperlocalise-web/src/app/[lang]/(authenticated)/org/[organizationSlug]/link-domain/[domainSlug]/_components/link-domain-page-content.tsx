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
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TypographyH1, TypographyH2, TypographyP } from "@/components/ui/typography";
import { Checkbox } from "@/components/ui/checkbox";
import { DOMAIN_RESEARCH_MARKETS } from "@/lib/domains/research-prototype";
import type { LinkedDomainVerificationMethod } from "@/lib/database/schema/linked-domains";
import type { LinkedDomainPublic } from "@/lib/linked-domains/types";

type LinkDomainPageContentProps = {
  organizationSlug: string;
  domainSlug: string;
  directDomain?: string;
  directMarketIds?: string[];
  directProjectId?: string;
  directCreateProject?: boolean;
};

type ApiErrorBody = {
  error?: string;
  message?: string;
};

type ProjectOption = {
  id: string;
  name: string;
};

type ProjectLinkMode = "create" | "existing" | "unassigned";

type MarketVisibility = {
  marketId: string;
  organicCount: number;
  organicEtv: number;
  top10Count: number;
  hasOrganicVisibility: boolean;
};

export function LinkDomainPageContent({
  organizationSlug,
  domainSlug,
  directDomain,
  directMarketIds,
  directProjectId,
  directCreateProject,
}: LinkDomainPageContentProps) {
  const [linkedDomain, setLinkedDomain] = useState<LinkedDomainPublic | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectMode, setProjectMode] = useState<ProjectLinkMode>("create");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<LinkedDomainVerificationMethod>("dns_txt");
  const [marketRecommendations, setMarketRecommendations] = useState<MarketVisibility[]>([]);
  const [selectedMarketIds, setSelectedMarketIds] = useState<string[]>([]);
  const [marketRecommendationsLoading, setMarketRecommendationsLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setProjectMode(
      directCreateProject === false ? "unassigned" : directProjectId ? "existing" : "create",
    );
    setSelectedProjectId(directProjectId ?? "");
    startTransition(async () => {
      setError(null);
      try {
        const [claimResponse, projectsResponse] = await Promise.all([
          fetch(`/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              directDomain
                ? { domain: directDomain, marketIds: directMarketIds ?? [] }
                : { domainSlug },
            ),
          }),
          fetch(`/api/orgs/${encodeURIComponent(organizationSlug)}/projects`),
        ]);

        const claimBody = (await claimResponse.json().catch(() => ({}))) as
          | { linkedDomain?: LinkedDomainPublic }
          | ApiErrorBody;
        if (!claimResponse.ok) {
          if (!cancelled) {
            setError(
              ("message" in claimBody && claimBody.message) ||
                ("error" in claimBody && claimBody.error) ||
                "Could not start domain claim.",
            );
          }
          return;
        }
        if (!cancelled && "linkedDomain" in claimBody && claimBody.linkedDomain) {
          setLinkedDomain(claimBody.linkedDomain);
        }

        if (projectsResponse.ok) {
          const projectsBody = (await projectsResponse.json().catch(() => ({}))) as {
            projects?: Array<{ id: string; name: string }>;
          };
          const options = (projectsBody.projects ?? []).map((project) => ({
            id: project.id,
            name: project.name,
          }));
          if (!cancelled) {
            setProjects(options);
            if (directProjectId) {
              setSelectedProjectId(directProjectId);
            } else if (options.length > 0) {
              setSelectedProjectId(options[0].id);
            } else if (directCreateProject !== false) {
              setProjectMode("create");
            }
          }
        }
      } catch {
        if (!cancelled) {
          setError("Could not start domain claim.");
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    organizationSlug,
    domainSlug,
    directDomain,
    directMarketIds,
    directProjectId,
    directCreateProject,
  ]);

  useEffect(() => {
    if (linkedDomain?.status !== "verified") return;
    if (linkedDomain.marketIds.length > 0) {
      setSelectedMarketIds(linkedDomain.marketIds);
      return;
    }
    let cancelled = false;
    setMarketRecommendationsLoading(true);
    fetch(
      `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${linkedDomain.id}/market-recommendations`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    )
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          marketRecommendations?: {
            candidates?: MarketVisibility[];
            recommended?: MarketVisibility[];
          };
          message?: string;
        };
        if (!response.ok || !body.marketRecommendations) {
          throw new Error(body.message || "Could not analyze markets.");
        }
        if (!cancelled) {
          const recommendations = body.marketRecommendations;
          setMarketRecommendations(recommendations.candidates ?? []);
          setSelectedMarketIds(
            (recommendations.recommended ?? []).map((market) => market.marketId),
          );
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Could not analyze markets.");
          setMarketRecommendations([]);
          setSelectedMarketIds(linkedDomain.marketIds);
        }
      })
      .finally(() => {
        if (!cancelled) setMarketRecommendationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [linkedDomain?.id, linkedDomain?.status, organizationSlug]);

  function saveMarkets() {
    if (!linkedDomain) return;
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(
          `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${linkedDomain.id}/markets`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ marketIds: selectedMarketIds }),
          },
        );
        const body = (await response.json().catch(() => ({}))) as
          | { linkedDomain?: LinkedDomainPublic }
          | ApiErrorBody;
        if (!response.ok || !("linkedDomain" in body) || !body.linkedDomain) {
          throw new Error(("message" in body && body.message) || "Could not save markets.");
        }
        setLinkedDomain(body.linkedDomain);
      } catch (reason: unknown) {
        setError(reason instanceof Error ? reason.message : "Could not save markets.");
      }
    });
  }

  function verify() {
    if (!linkedDomain) return;
    if (projectMode === "existing" && !selectedProjectId) {
      setError("Select a project to link this domain to.");
      return;
    }

    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(
          `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${linkedDomain.id}/verify`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              projectMode === "existing"
                ? { method, projectId: selectedProjectId }
                : { method, createProject: projectMode === "create" },
            ),
          },
        );
        const body = (await response.json().catch(() => ({}))) as
          | { linkedDomain?: LinkedDomainPublic }
          | ApiErrorBody;
        if (!response.ok) {
          setError(
            ("message" in body && body.message) ||
              ("error" in body && body.error) ||
              "Verification failed.",
          );
          return;
        }
        if ("linkedDomain" in body && body.linkedDomain) {
          setLinkedDomain(body.linkedDomain);
        }
      } catch {
        setError("Verification failed.");
      }
    });
  }

  if (linkedDomain?.status === "verified") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <TypographyH1>Domain linked</TypographyH1>
        <TypographyP tone="subtle">
          {linkedDomain.domainKey} is verified for this workspace.
        </TypographyP>
        <section className="space-y-4">
          <div>
            <TypographyH2 className="pb-0">Recommended markets</TypographyH2>
            <TypographyP tone="subtle">
              We check the site’s locale signals and Google organic visibility after verification.
            </TypographyP>
          </div>
          {marketRecommendationsLoading ? (
            <TypographyP tone="subtle">Checking organic visibility…</TypographyP>
          ) : marketRecommendations.length ? (
            <div className="space-y-3">
              {marketRecommendations.map((recommendation) => {
                const market = DOMAIN_RESEARCH_MARKETS.find(
                  (candidate) => candidate.id === recommendation.marketId,
                );
                if (!market) return null;
                return (
                  <label key={market.id} className="flex items-start gap-3 rounded-lg border p-3">
                    <Checkbox
                      checked={selectedMarketIds.includes(market.id)}
                      onCheckedChange={(checked) =>
                        setSelectedMarketIds((current) =>
                          checked
                            ? [...current, market.id]
                            : current.filter((id) => id !== market.id),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{market.label}</span>
                      <span className="block text-sm text-muted-foreground">
                        {recommendation.organicCount.toLocaleString()} ranking keywords ·{" "}
                        {recommendation.organicEtv.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}{" "}
                        monthly estimated organic visits · {recommendation.top10Count} top-10
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <TypographyP tone="subtle">
              No organic visibility was found in the initial markets. You can choose markets
              manually below.
            </TypographyP>
          )}
          <div className="grid gap-2">
            <Label htmlFor="verified-domain-markets">Markets</Label>
            <select
              id="verified-domain-markets"
              multiple
              className="min-h-40 w-full rounded-md border border-input bg-transparent p-2 text-sm"
              value={selectedMarketIds}
              onChange={(event) =>
                setSelectedMarketIds(
                  [...event.currentTarget.selectedOptions].map((option) => option.value),
                )
              }
            >
              {DOMAIN_RESEARCH_MARKETS.map((market) => (
                <option key={market.id} value={market.id}>
                  {market.label}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            onClick={saveMarkets}
            disabled={pending || marketRecommendationsLoading}
          >
            {pending ? "Saving markets…" : "Save markets"}
          </Button>
        </section>
        <div className="flex flex-wrap gap-3">
          {linkedDomain.projectId ? (
            <Button
              nativeButton={false}
              render={<Link href={`/org/${organizationSlug}/projects/${linkedDomain.projectId}`} />}
            >
              Open project
            </Button>
          ) : null}
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/org/${organizationSlug}/domains`} />}
          >
            View domains
          </Button>
          {linkedDomain.id ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/org/${organizationSlug}/domains/${linkedDomain.id}`} />}
            >
              View report
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <div>
        <TypographyH1>Link domain</TypographyH1>
        <TypographyP className="mt-3" tone="subtle">
          Prove you control this domain to attach the localisation audit to your workspace, then
          link it to a project for deeper work.
        </TypographyP>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!linkedDomain ? (
        <p className="text-sm text-muted-foreground">
          {pending ? "Preparing verification…" : "Waiting for claim…"}
        </p>
      ) : (
        <>
          <section className="space-y-2">
            <TypographyH2 className="pb-0">{linkedDomain.domainKey}</TypographyH2>
            <p className="text-sm text-muted-foreground">
              Status: {linkedDomain.status.replaceAll("_", " ")}
            </p>
          </section>

          <section className="space-y-4">
            <TypographyH2 className="pb-0">Project</TypographyH2>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={projectMode === "create" ? "default" : "outline"}
                onClick={() => setProjectMode("create")}
              >
                Create new project
              </Button>
              <Button
                type="button"
                variant={projectMode === "existing" ? "default" : "outline"}
                onClick={() => setProjectMode("existing")}
                disabled={projects.length === 0}
              >
                Use existing project
              </Button>
              <Button
                type="button"
                variant={projectMode === "unassigned" ? "default" : "outline"}
                onClick={() => setProjectMode("unassigned")}
              >
                Leave unassigned
              </Button>
            </div>
            {projectMode === "create" ? (
              <p className="text-sm text-muted-foreground">
                Creates a native project named{" "}
                <span className="font-medium">{linkedDomain.domainKey}</span>.
              </p>
            ) : projectMode === "existing" ? (
              <div className="space-y-2">
                <Label htmlFor="linked-domain-project">Project</Label>
                <select
                  id="linked-domain-project"
                  className="flex h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.currentTarget.value)}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                The domain will be verified without attaching it to a project.
              </p>
            )}
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No projects in this workspace yet — you can create one or leave the domain
                unassigned.
              </p>
            ) : null}
          </section>

          <section className="space-y-4">
            <TypographyH2 className="pb-0">Choose a verification method</TypographyH2>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["dns_txt", "DNS TXT (recommended)"],
                  ["html_file", "HTML file"],
                  ["meta_tag", "Meta tag"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant={method === value ? "default" : "outline"}
                  onClick={() => setMethod(value)}
                >
                  {label}
                </Button>
              ))}
            </div>

            {method === "dns_txt" ? (
              <ChallengeBlock
                title="Add a DNS TXT record"
                lines={[
                  `Host: ${linkedDomain.challenges.dnsTxt.host}`,
                  `Value: ${linkedDomain.challenges.dnsTxt.value}`,
                ]}
              />
            ) : null}

            {method === "html_file" ? (
              <ChallengeBlock
                title="Upload a verification file"
                lines={[
                  `URL: ${linkedDomain.challenges.htmlFile.url}`,
                  `Body: ${linkedDomain.challenges.htmlFile.body}`,
                ]}
              />
            ) : null}

            {method === "meta_tag" ? (
              <ChallengeBlock
                title="Add this meta tag to your homepage <head>"
                lines={[linkedDomain.challenges.metaTag.html]}
              />
            ) : null}

            <Button type="button" onClick={verify} disabled={pending}>
              {pending ? "Verifying…" : "I’ve added it — Verify"}
            </Button>
          </section>
        </>
      )}
    </div>
  );
}

function ChallengeBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <ul className="mt-3 space-y-2 font-mono text-xs break-all text-muted-foreground">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
