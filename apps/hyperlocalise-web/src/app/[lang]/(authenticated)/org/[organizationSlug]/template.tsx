/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
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
  // Outermost VT owns the snapshot for this segment. Nested page-level
  // <ViewTransition enter/exit> under here will not fire while this one animates —
  // remove or relocate this wrapper before adding page VTs.
  return (
    <ViewTransition enter="slide-up" default="none">
      {children}
    </ViewTransition>
  );
}
