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
import { ArrowLeft01Icon, FlaskConicalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Row } from "@/components/ui/layout/row";
import { Rows } from "@/components/ui/layout/rows";
import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { cn } from "@/lib/primitives/cn";

import { hyperlabMessages as messages } from "./hyperlab.messages";

type HyperlabSection = "overview" | "experiments" | "audiences" | "flags" | "keys";

const SECTIONS: Array<{ id: HyperlabSection; href: string; message: typeof messages.navHome }> = [
  { id: "overview", href: "", message: messages.navHome },
  { id: "experiments", href: "/experiments", message: messages.navExperiments },
  { id: "audiences", href: "/audiences", message: messages.navAudiences },
  { id: "flags", href: "/flags", message: messages.navFlags },
  { id: "keys", href: "/keys", message: messages.navKeys },
];

export function HyperlabPageShell({
  organizationSlug,
  section,
  title,
  description,
  actions,
  backHref,
  children,
}: {
  organizationSlug: string;
  section: HyperlabSection;
  title: string;
  description: string;
  actions?: ReactNode;
  backHref?: string;
  children: ReactNode;
}) {
  const intl = useIntl();
  const base = `/org/${organizationSlug}/hyperlab`;

  return (
    <WorkspacePageShell>
      <Rows spacing="3u">
        {backHref ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-fit px-0"
            nativeButton={false}
            render={<Link href={backHref} />}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.8} data-icon="inline-start" />
            <FormattedMessage {...messages.backToList} />
          </Button>
        ) : null}
        <PageHeader
          icon={FlaskConicalIcon}
          label={intl.formatMessage(messages.workspaceLabel)}
          title={title}
          description={description}
          actions={actions}
        />
        <nav aria-label="Hyperlab" className="border-b border-border">
          <Row spacing="0.5u" alignY="center">
            {SECTIONS.map((item) => {
              const href = `${base}${item.href}`;
              const active = section === item.id;
              return (
                <Link
                  key={item.id}
                  href={href}
                  className={cn(
                    "relative px-3 py-2 text-sm",
                    active
                      ? "font-medium text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <FormattedMessage {...item.message} />
                </Link>
              );
            })}
          </Row>
        </nav>
        {children}
      </Rows>
    </WorkspacePageShell>
  );
}
