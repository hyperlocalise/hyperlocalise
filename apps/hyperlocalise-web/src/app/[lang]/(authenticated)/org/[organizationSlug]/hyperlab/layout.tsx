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

import { FeatureTeaserPage } from "@/components/feature-teaser/feature-teaser-page";
import { getWorkspaceFeatureFlagEnabled, workspaceHyperlabFlag } from "@/lib/flags/workspace-flags";
import { requireAppCapability } from "@/lib/workos/app-auth";

export default async function HyperlabLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppCapability("experiments:read", { organizationSlug });
  const enabled = await getWorkspaceFeatureFlagEnabled(workspaceHyperlabFlag, auth);

  if (!enabled) {
    return <FeatureTeaserPage feature="hyperlab" scope="workspace" />;
  }

  return children;
}
