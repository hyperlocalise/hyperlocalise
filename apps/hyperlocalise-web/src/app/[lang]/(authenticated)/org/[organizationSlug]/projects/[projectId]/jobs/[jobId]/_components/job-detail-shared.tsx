"use client";

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
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";

import { jobDetailSharedMessages as messages } from "./job-detail-shared.messages";

export type JobDetailBackLinkRenderer = (props: { href: string; children: ReactNode }) => ReactNode;

export type JobDetailErrorRenderer = (props: { error: unknown }) => ReactNode;

export function defaultRenderBackLink({
  href,
  children,
}: Parameters<JobDetailBackLinkRenderer>[0]) {
  return (
    <Button
      nativeButton={false}
      render={<Link href={href} />}
      variant="ghost"
      className="-ms-2 mb-2 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={1.8} />
      {children}
    </Button>
  );
}

export function defaultRenderError({ error }: Parameters<JobDetailErrorRenderer>[0]) {
  return (
    <div className="rounded-lg border border-flame-300/20 bg-flame-300/8 p-5 text-sm text-flame-100">
      {error instanceof Error ? error.message : <FormattedMessage {...messages.unableToLoadJob} />}
    </div>
  );
}
