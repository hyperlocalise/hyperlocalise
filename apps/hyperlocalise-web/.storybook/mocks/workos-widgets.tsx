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
import type { ReactNode } from "react";

export function WorkOsWidgets({ children }: { children: ReactNode }) {
  return children;
}

export function Pipes({ filter }: { filter?: { slugs?: string[] } }) {
  const slugs = filter?.slugs?.join(", ") || "Pipes";
  return <div data-testid="workos-pipes-widget">{slugs} Pipes widget</div>;
}

export function PipesLoading() {
  return <div>Loading Pipes</div>;
}
