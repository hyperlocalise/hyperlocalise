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
import { ViewTransition } from "react";

type OrganizationTemplateProps = {
  children: ReactNode;
};

export default function OrganizationTemplate({ children }: OrganizationTemplateProps) {
  // Cross-fade on lateral sidebar navigation. With partial prefetch, content is
  // usually ready immediately — this is polish, not a loading mask. Per-page
  // Suspense reveals live in OrgPageSuspense for uncached segments.
  return (
    <ViewTransition enter="fade-in" exit="fade-out" default="none">
      {children}
    </ViewTransition>
  );
}
