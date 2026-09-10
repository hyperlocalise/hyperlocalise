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

import { createContext, useContext, type ReactNode } from "react";
import type { DomainResearchDomain } from "@/lib/domains/research-prototype";
import { useDomainPrototype } from "./use-domain-prototype";

export type DomainResearchPreviewValue = {
  domains: DomainResearchDomain[];
  saveDomain: (domain: DomainResearchDomain) => void;
};

const DomainResearchPreviewContext = createContext<DomainResearchPreviewValue | null>(null);

export function DomainResearchPreviewProvider({
  organizationSlug,
  children,
}: {
  organizationSlug: string;
  children: ReactNode;
}) {
  const value = useDomainPrototype(organizationSlug);
  return <DomainResearchPreviewContext value={value}>{children}</DomainResearchPreviewContext>;
}

export function useDomainResearchPreview() {
  return useContext(DomainResearchPreviewContext);
}
