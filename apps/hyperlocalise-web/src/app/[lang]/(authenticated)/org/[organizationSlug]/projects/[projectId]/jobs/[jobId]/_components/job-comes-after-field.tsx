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
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useIntl } from "react-intl";

import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { buildJobDetailHref } from "../../../../../jobs/_components/jobs-view-helpers";
import { jobComesAfterFieldMessages as messages } from "./job-comes-after-field.messages";
import { jobDetailTaskLayoutFromRecord } from "./job-detail-layout-helpers";
import type { JobDetailRecord } from "./job-detail-types";

/**
 * The task this one comes after, as a link, with a note while this task still waits for it.
 * The earlier task is in the same project.
 */
export function JobComesAfterField({
  organizationSlug,
  projectId,
  afterJobId,
  waiting,
  linkOnlyWhenReadable = false,
}: {
  organizationSlug: string;
  projectId: string;
  afterJobId: string;
  waiting: boolean;
  /**
   * For someone here only through a task they own: the earlier task is linked only when they
   * can open it too, which is when it loads.
   */
  linkOnlyWhenReadable?: boolean;
}) {
  const intl = useIntl();
  const { client: goSvcClient } = useGoSvcClient();
  const earlierJob = useQuery({
    queryKey: ["job", organizationSlug, projectId, afterJobId] as const,
    queryFn: async () =>
      (await goSvcClient.job.get<JobDetailRecord>(organizationSlug, afterJobId)).job,
    retry: false,
  });
  const title = earlierJob.data
    ? jobDetailTaskLayoutFromRecord(earlierJob.data, intl).title
    : intl.formatMessage(messages.earlierTask);
  const href =
    linkOnlyWhenReadable && !earlierJob.data
      ? null
      : buildJobDetailHref(organizationSlug, projectId, afterJobId);

  return (
    <span className="flex min-w-0 flex-col gap-1">
      {href ? (
        <Link href={href} className="truncate underline underline-offset-2">
          {title}
        </Link>
      ) : (
        <span className="truncate">{title}</span>
      )}
      {waiting ? (
        <span className="text-xs text-muted-foreground">
          {intl.formatMessage(messages.waiting)}
        </span>
      ) : null}
    </span>
  );
}
