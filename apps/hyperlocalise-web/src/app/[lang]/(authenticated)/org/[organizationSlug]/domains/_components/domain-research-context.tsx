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

import { createContext, useContext } from "react";
import {
  getResearchPrototypeCatalog,
  type DomainResearchCatalog,
} from "@/lib/domains/research-prototype";

export const DomainResearchContext = createContext<DomainResearchCatalog | null | undefined>(
  undefined,
);

export function useDomainResearchCatalog(linkedDomainId: string) {
  const catalog = useContext(DomainResearchContext);
  return catalog === undefined ? getResearchPrototypeCatalog(linkedDomainId) : catalog;
}
