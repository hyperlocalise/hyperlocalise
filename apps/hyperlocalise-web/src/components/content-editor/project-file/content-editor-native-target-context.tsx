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
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { createTargetBatcher } from "./content-editor-target-batcher";

const NativeTargetContext = createContext<ReturnType<typeof createTargetBatcher> | null>(null);
export const useNativeTargetLoader = () => useContext(NativeTargetContext);

export function NativeTargetProvider({
  client,
  organizationSlug,
  projectId,
  enabled,
  children,
}: {
  client: GoSvcClient;
  organizationSlug: string;
  projectId: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const loader = useMemo(
    () =>
      enabled
        ? createTargetBatcher(
            async (body, signal) =>
              (await client.cat.targets(organizationSlug, projectId, body, { signal })).targets,
          )
        : null,
    [client, organizationSlug, projectId, enabled],
  );
  return <NativeTargetContext.Provider value={loader}>{children}</NativeTargetContext.Provider>;
}
