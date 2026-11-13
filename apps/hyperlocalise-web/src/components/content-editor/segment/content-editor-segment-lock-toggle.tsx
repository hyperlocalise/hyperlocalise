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
import { LockIcon, LockOpenIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { contentEditorLockedStringMessages as messages } from "@/components/content-editor/shared/content-editor.messages";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/primitives/cn";

/**
 * Toggles the lock on one string. Shows a pending state while the request runs
 * and reports failures with a toast, because callers fire it from row chrome.
 */
export function ContentEditorSegmentLockToggle({
  isLocked,
  onToggle,
  disabled = false,
  showLabel = false,
  className,
}: {
  isLocked: boolean;
  onToggle: () => void | Promise<void>;
  disabled?: boolean;
  showLabel?: boolean;
  className?: string;
}) {
  const intl = useIntl();
  const [isPending, setIsPending] = useState(false);
  const label = intl.formatMessage(isLocked ? messages.unlockTooltip : messages.lockTooltip);
  const Icon = isLocked ? LockIcon : LockOpenIcon;

  const handleClick = async () => {
    if (isPending) {
      return;
    }
    setIsPending(true);
    try {
      await onToggle();
    } catch {
      toast.error(intl.formatMessage(isLocked ? messages.unlockFailed : messages.lockFailed));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant={isLocked ? "secondary" : "ghost"}
              size={showLabel ? "xs" : "icon-sm"}
              className={cn("shrink-0", className)}
              disabled={disabled || isPending}
              aria-pressed={isLocked}
              aria-label={label}
              onClick={() => void handleClick()}
            />
          }
        >
          {isPending ? (
            <Spinner className="size-3.5" />
          ) : (
            <Icon className="size-4" weight={isLocked ? "fill" : "regular"} aria-hidden />
          )}
          {showLabel ? (
            <FormattedMessage {...(isLocked ? messages.unlock : messages.lock)} />
          ) : null}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
