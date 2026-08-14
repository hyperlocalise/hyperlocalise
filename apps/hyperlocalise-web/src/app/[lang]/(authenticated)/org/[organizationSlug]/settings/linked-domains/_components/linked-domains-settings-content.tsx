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
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import type { LinkedDomainPublic } from "@/lib/linked-domains/types";

type LinkedDomainsSettingsContentProps = {
  organizationSlug: string;
};

export function LinkedDomainsSettingsContent({
  organizationSlug,
}: LinkedDomainsSettingsContentProps) {
  const [linkedDomains, setLinkedDomains] = useState<LinkedDomainPublic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains`,
        );
        const body = (await response.json().catch(() => ({}))) as {
          linkedDomains?: LinkedDomainPublic[];
          message?: string;
          error?: string;
        };
        if (!response.ok) {
          if (!cancelled) {
            setError(body.message || body.error || "Could not load linked domains.");
          }
          return;
        }
        if (!cancelled) {
          setLinkedDomains(body.linkedDomains ?? []);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load linked domains.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationSlug]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div>
        <TypographyH1>Linked domains</TypographyH1>
        <TypographyP className="mt-3 text-muted-foreground">
          Domains verified for this workspace, including claims started from a localisation audit.
        </TypographyP>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      {!loading && linkedDomains.length === 0 ? (
        <p className="text-sm text-muted-foreground">No linked domains yet.</p>
      ) : null}

      <ul className="divide-y divide-border rounded-lg border border-border">
        {linkedDomains.map((domain) => (
          <li
            key={domain.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div>
              <p className="font-medium text-foreground">{domain.domainKey}</p>
              <p className="text-sm text-muted-foreground">
                {domain.status.replaceAll("_", " ")}
                {domain.verifiedMethod ? ` · ${domain.verifiedMethod}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {domain.status !== "verified" ? (
                <Button
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link href={`/org/${organizationSlug}/link-domain/${domain.domainSlug}`} />
                  }
                >
                  Continue verification
                </Button>
              ) : null}
              {domain.projectId ? (
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={`/org/${organizationSlug}/projects/${domain.projectId}`} />}
                >
                  Open project
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
