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
import Link from "next/link";
import { FlaskConicalIcon } from "@hugeicons/core-free-icons";
import { FormattedMessage } from "react-intl";

import { Box } from "@/components/ui/layout/box";
import { Row } from "@/components/ui/layout/row";
import { Rows } from "@/components/ui/layout/rows";
import { PageHeader, WorkspacePageShell } from "../../../_components/workspace-resource-shared";
import { cn } from "@/lib/primitives/cn";

import { hyperlabMessages as messages } from "./hyperlab.messages";

type HyperlabSection = "overview" | "flags" | "experiments" | "audiences" | "keys";

const SECTION_HREF: Record<HyperlabSection, string> = {
  overview: "",
  flags: "/flags",
  experiments: "/experiments",
  audiences: "/audiences",
  keys: "/keys",
};

export function HyperlabPageShell({
  organizationSlug,
  section,
  title,
  description,
  actions,
  children,
}: {
  organizationSlug: string;
  section: HyperlabSection;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const base = `/org/${organizationSlug}/hyperlab`;

  return (
    <WorkspacePageShell>
      <Rows spacing="3u">
        <PageHeader
          icon={FlaskConicalIcon}
          label="Workspace"
          title={title}
          description={description}
          actions={actions}
        />
        <Box border="standard" borderRadius="standard" paddingX="1u">
          <nav aria-label="Hyperlab">
            <Row spacing="0.5u" alignY="center">
              {(
                [
                  ["overview", messages.navOverview],
                  ["flags", messages.navFlags],
                  ["experiments", messages.navExperiments],
                  ["audiences", messages.navAudiences],
                  ["keys", messages.navKeys],
                ] as const
              ).map(([id, message]) => {
                const href = `${base}${SECTION_HREF[id]}`;
                const active = section === id;
                return (
                  <Link
                    key={id}
                    href={href}
                    className={cn(
                      "px-3 py-2 text-sm",
                      active
                        ? "font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <FormattedMessage {...message} />
                  </Link>
                );
              })}
            </Row>
          </nav>
        </Box>
        {children}
      </Rows>
    </WorkspacePageShell>
  );
}
