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
import { FormattedMessage } from "react-intl";

import { jobDetailSharedMessages as messages } from "./job-detail-shared.messages";

export type JobDetailBackLinkRenderer = (props: { href: string; children: ReactNode }) => ReactNode;

export type JobDetailErrorRenderer = (props: { error: unknown }) => ReactNode;

export function defaultRenderError({ error }: Parameters<JobDetailErrorRenderer>[0]) {
  return (
    <div className="rounded-lg border border-flame-300/20 bg-flame-300/8 p-5 text-sm text-flame-100">
      {error instanceof Error ? error.message : <FormattedMessage {...messages.unableToLoadJob} />}
    </div>
  );
}
