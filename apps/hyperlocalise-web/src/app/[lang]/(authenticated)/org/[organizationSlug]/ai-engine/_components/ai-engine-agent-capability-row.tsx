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
import { FormattedMessage } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/primitives/cn";

import { aiEnginePageContentMessages } from "./ai-engine-page-content.messages";

type AiEngineAgentCapabilityRowProps = {
  name: string;
  description: string;
  effectiveModel: string;
  isLast?: boolean;
};

export function AiEngineAgentCapabilityRow({
  name,
  description,
  effectiveModel,
  isLast = false,
}: AiEngineAgentCapabilityRowProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center",
        !isLast && "border-b border-border",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-foreground">{name}</p>
        <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>

      <div className="flex shrink-0 flex-col items-start gap-2 sm:min-w-[14rem] sm:items-end">
        <p className="font-mono text-sm text-foreground">{effectiveModel}</p>
        <Badge variant="outline" className="text-[10px]">
          <FormattedMessage {...aiEnginePageContentMessages.workspaceDefaultBadge} />
        </Badge>
      </div>
    </div>
  );
}
