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

import { getTmsProviderBranding } from "@/lib/providers/shared/tms-provider-branding";

export const HYPERLOCALISE_GROUP_TITLE = "Hyperlocalise";

export function tmsProviderTitle(kind: string | null | undefined) {
  if (!kind || kind === "unknown") {
    return "TMS";
  }

  return getTmsProviderBranding(kind).name;
}

export function groupByTmsProvider<T extends { externalProviderKind: string | null }>({
  items,
  connectedKinds,
}: {
  items: readonly T[];
  connectedKinds: readonly string[];
}): { id: string; title: string; items: T[] }[] {
  const grouped = new Map<string, T[]>();
  const order: string[] = [];

  for (const kind of connectedKinds) {
    if (!kind || grouped.has(kind)) {
      continue;
    }
    grouped.set(kind, []);
    order.push(kind);
  }

  for (const item of items) {
    const kind = item.externalProviderKind ?? "unknown";
    const current = grouped.get(kind);
    if (current) {
      current.push(item);
      continue;
    }
    grouped.set(kind, [item]);
    order.push(kind);
  }

  return order.map((kind) => ({
    id: kind,
    title: tmsProviderTitle(kind),
    items: grouped.get(kind) ?? [],
  }));
}
