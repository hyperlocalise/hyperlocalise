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
import Link from "next/link";
import { useId } from "react";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useIntl } from "react-intl";

import { buildOrganizationPath, buildProjectPath } from "@/components/app-shell/navigation-config";
import { Button } from "@/components/ui/button";
import {
  summarizeQaAttention,
  useWorkspaceQaReports,
  type QaAttention,
} from "@/lib/qa/use-workspace-qa-reports";

import { qaAttentionCardMessages as messages } from "./qa-attention-card.messages";

export function QaAttentionCardView({
  attention,
  href,
  scope,
}: {
  attention: QaAttention;
  href: string;
  scope: "workspace" | "project";
}) {
  const intl = useIntl();
  const titleId = useId();
  const { errors, projectsWithErrors, failedScans } = attention;
  if (errors === 0 && failedScans === 0) return null;

  const failedTitle = intl.formatMessage(messages.failedTitle, { count: failedScans });
  const title =
    errors > 0 ? intl.formatMessage(messages.errorsTitle, { count: errors }) : failedTitle;
  const detail =
    errors === 0
      ? intl.formatMessage(messages.failedDetail)
      : scope === "workspace"
        ? intl.formatMessage(messages.workspaceErrorsDetail, { count: projectsWithErrors })
        : intl.formatMessage(messages.projectErrorsDetail);

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 id={titleId} className="text-sm font-medium text-foreground">
          {title}
        </h2>
        <p className="text-[13px] leading-5 text-pretty text-muted-foreground">{detail}</p>
        {errors > 0 && failedScans > 0 ? (
          <p className="text-[13px] leading-5 font-medium text-pretty text-destructive">
            {failedTitle}
          </p>
        ) : null}
      </div>
      <Button
        nativeButton={false}
        render={<Link href={href} />}
        size="sm"
        variant="outline"
        className="w-full sm:w-fit"
      >
        {intl.formatMessage(messages.reviewQa)}
      </Button>
    </section>
  );
}

/** Shows errors or failed scans from the latest QA reports; renders nothing when QA is clean. */
export function QaAttentionCard({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId?: string;
}) {
  const reportsQuery = useWorkspaceQaReports(organizationSlug);

  return (
    <QaAttentionCardView
      attention={summarizeQaAttention(reportsQuery.data?.reports, projectId)}
      scope={projectId ? "project" : "workspace"}
      href={
        projectId
          ? buildProjectPath(organizationSlug, projectId, "qa")
          : buildOrganizationPath(organizationSlug, "qa")
      }
    />
  );
}
