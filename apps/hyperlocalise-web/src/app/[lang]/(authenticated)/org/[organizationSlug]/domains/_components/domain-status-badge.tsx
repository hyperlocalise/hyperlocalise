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
import { useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import type { DomainResearchStatus } from "@/lib/domains/research-prototype";

import { formatDomainStatus } from "./domain-research-format";

export function DomainStatusBadge({ status }: { status: DomainResearchStatus }) {
  const intl = useIntl();
  return (
    <Badge variant={status === "verified" ? "success" : "warning"}>
      {formatDomainStatus(intl, status)}
    </Badge>
  );
}
