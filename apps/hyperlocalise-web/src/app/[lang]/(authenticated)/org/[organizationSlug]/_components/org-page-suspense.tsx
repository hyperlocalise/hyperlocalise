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
import { Suspense, type ReactNode } from "react";
import { ViewTransition } from "react";

import { OrganizationRouteLoading } from "./organization-route-loading";

type OrgPageSuspenseProps = {
  children: ReactNode;
};

export function OrgPageSuspense({ children }: OrgPageSuspenseProps) {
  return (
    <Suspense
      fallback={
        <ViewTransition exit="fade-out" default="none">
          <OrganizationRouteLoading />
        </ViewTransition>
      }
    >
      <ViewTransition enter="fade-in" default="none">
        {children}
      </ViewTransition>
    </Suspense>
  );
}
