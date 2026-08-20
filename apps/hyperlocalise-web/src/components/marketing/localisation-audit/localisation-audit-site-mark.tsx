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

import { cn } from "@/lib/primitives/cn";

const MARK_TONES = [
  "bg-grove-100 text-grove-900",
  "bg-spruce-100 text-spruce-900",
  "bg-clay-100 text-clay-900",
  "bg-beam-100 text-beam-900",
  "bg-dew-100 text-dew-900",
] as const;

type LocalisationAuditSiteMarkProps = {
  domainKey: string;
  companyName: string | null;
  logoUrl: string | null;
};

function companyMonogram(name: string | null, domainKey: string) {
  const source = (name ?? domainKey).trim();
  const letter = source.charAt(0).toUpperCase();
  return letter || "H";
}

function markToneClass(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return MARK_TONES[hash % MARK_TONES.length];
}

export function LocalisationAuditSiteMark({
  domainKey,
  companyName,
  logoUrl,
}: LocalisationAuditSiteMarkProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = Boolean(logoUrl) && !logoFailed;
  const imageSrc = showLogo ? logoUrl : null;

  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border",
        imageSrc ? "bg-background" : markToneClass(domainKey),
      )}
    >
      {imageSrc ? (
        // Arbitrary audited-site logos; next/image host allowlist cannot cover them.
        <img
          src={imageSrc}
          alt=""
          width={32}
          height={32}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full object-contain p-0.5"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <span className="text-sm font-semibold">{companyMonogram(companyName, domainKey)}</span>
      )}
    </span>
  );
}
