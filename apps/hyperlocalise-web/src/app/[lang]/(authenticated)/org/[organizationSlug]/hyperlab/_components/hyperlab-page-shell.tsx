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
import { Rows } from "@/components/ui/layout/rows";
import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";

import { hyperlabMessages as messages } from "./hyperlab.messages";

export function HyperlabPageShell({
  title,
  description,
  actions,
  backHref,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  backHref?: string;
  children: ReactNode;
}) {
  const intl = useIntl();

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
        {children}
      </Rows>
    </WorkspacePageShell>
  );
}
