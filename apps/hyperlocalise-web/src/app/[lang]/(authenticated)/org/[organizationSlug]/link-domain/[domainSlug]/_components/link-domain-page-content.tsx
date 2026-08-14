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
import { TypographyH1, TypographyH2, TypographyP } from "@/components/ui/typography";
import type { LinkedDomainPublic } from "@/lib/linked-domains/types";
import type { LinkedDomainVerificationMethod } from "@/lib/database/schema/linked-domains";

type LinkDomainPageContentProps = {
  organizationSlug: string;
  domainSlug: string;
};

type ApiErrorBody = {
  error?: string;
  message?: string;
};

export function LinkDomainPageContent({
  organizationSlug,
  domainSlug,
}: LinkDomainPageContentProps) {
  const [linkedDomain, setLinkedDomain] = useState<LinkedDomainPublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<LinkedDomainVerificationMethod>("dns_txt");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(
          `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domainSlug }),
          },
        );
        const body = (await response.json().catch(() => ({}))) as
          | { linkedDomain?: LinkedDomainPublic }
          | ApiErrorBody;
        if (!response.ok) {
          if (!cancelled) {
            setError(
              ("message" in body && body.message) ||
                ("error" in body && body.error) ||
                "Could not start domain claim.",
            );
          }
          return;
        }
        if (!cancelled && "linkedDomain" in body && body.linkedDomain) {
          setLinkedDomain(body.linkedDomain);
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
  }, [organizationSlug, domainSlug]);

  function verify() {
    if (!linkedDomain) return;
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(
          `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${linkedDomain.id}/verify`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ method }),
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
        <TypographyP className="text-muted-foreground">
          {linkedDomain.domainKey} is verified for this workspace.
        </TypographyP>
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
            render={<Link href={`/org/${organizationSlug}/settings/linked-domains`} />}
          >
            View linked domains
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <div>
        <TypographyH1>Link domain</TypographyH1>
        <TypographyP className="mt-3 text-muted-foreground">
          Prove you control this domain to attach the localisation audit to your workspace and
          create a project for deeper work.
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
            <TypographyH2 className="pb-0 text-lg">{linkedDomain.domainKey}</TypographyH2>
            <p className="text-sm text-muted-foreground">
              Status: {linkedDomain.status.replaceAll("_", " ")}
            </p>
          </section>

          <section className="space-y-4">
            <TypographyH2 className="pb-0 text-lg">Choose a verification method</TypographyH2>
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
