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
import Image from "next/image";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SimpleIcon } from "simple-icons";
import { FormattedMessage } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/primitives/cn";
import { modelProviderCardMessages } from "./model-provider-card.messages";
import { SimpleBrandIcon } from "./simple-brand-icon";

export type ModelProviderCardConfig = {
  id: string;
  label: string;
  description: string;
  icon?: SimpleIcon;
  logo: string;
};

type ModelProviderCardProps = {
  provider: ModelProviderCardConfig;
  isConnected?: boolean;
  isManaged?: boolean;
  footerLabel?: string;
  onSelect?: () => void;
  disabled?: boolean;
  interactive?: boolean;
};

export function ModelProviderCard({
  provider,
  isConnected = false,
  isManaged,
  footerLabel,
  onSelect,
  disabled,
  interactive = true,
}: ModelProviderCardProps) {
  const cardClassName = cn(
    "group relative flex min-h-44 w-full flex-col rounded-lg border border-border bg-card p-5 text-left text-card-foreground transition-colors",
    interactive && "hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
  );

  const content = (
    <>
      {isConnected ? (
        <Badge
          variant="outline"
          className={cn(
            "absolute top-4 right-4 text-[10px]",
            "border-grove-500/35 bg-grove-100 text-grove-900 dark:border-grove-300/20 dark:bg-grove-300/10 dark:text-grove-300",
          )}
        >
          <FormattedMessage {...modelProviderCardMessages.connectedBadge} />
        </Badge>
      ) : null}

      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg border border-border p-2",
          isConnected ? "bg-muted text-foreground" : "bg-background text-foreground",
        )}
      >
        {provider.icon ? (
          <SimpleBrandIcon icon={provider.icon} colored={isConnected} />
        ) : (
          <Image
            src={provider.logo}
            alt=""
            width={28}
            height={28}
            className={cn("max-h-7 w-auto object-contain", !isConnected && "opacity-75")}
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-base font-medium text-foreground">{provider.label}</span>
        {isManaged ? (
          <Badge variant="outline" className="text-[10px]">
            <FormattedMessage {...modelProviderCardMessages.managedBadge} />
          </Badge>
        ) : null}
      </div>

      <p className="mt-1 text-sm text-muted-foreground">{provider.description}</p>

      {footerLabel ? (
        <div
          className={cn(
            "mt-auto flex items-center justify-end gap-1 pt-6 text-sm text-muted-foreground",
            interactive && "group-disabled:opacity-60",
          )}
        >
          <span>{footerLabel}</span>
          {interactive ? (
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              strokeWidth={1.8}
              className="size-4 transition-transform group-hover:translate-x-0.5 group-disabled:translate-x-0"
            />
          ) : null}
        </div>
      ) : null}
    </>
  );

  if (!interactive) {
    return <div className={cardClassName}>{content}</div>;
  }

  return (
    <button type="button" onClick={onSelect} disabled={disabled} className={cardClassName}>
      {content}
    </button>
  );
}
