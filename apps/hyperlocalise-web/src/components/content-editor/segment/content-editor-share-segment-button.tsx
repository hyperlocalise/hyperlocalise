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
import { LinkSquare02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { contentEditorEditorPanelMessages } from "@/components/content-editor/shared/content-editor.messages";

export function ContentEditorShareSegmentButton({
  segmentShareUrl,
  size = "icon-sm",
}: {
  segmentShareUrl: string;
  size?: "icon-sm" | "icon-xs" | "icon";
}) {
  const intl = useIntl();
  const [shareLinkState, setShareLinkState] = useState<"idle" | "copied" | "error">("idle");
  const tooltip =
    shareLinkState === "copied"
      ? intl.formatMessage(contentEditorEditorPanelMessages.shareSegmentCopied)
      : shareLinkState === "error"
        ? intl.formatMessage(contentEditorEditorPanelMessages.shareSegmentFailed)
        : intl.formatMessage(contentEditorEditorPanelMessages.shareSegment);
  const iconClassName = size === "icon-xs" ? "size-3.5" : "size-5";

  async function handleShareSegment() {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      setShareLinkState("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(segmentShareUrl);
      setShareLinkState("copied");
      window.setTimeout(() => setShareLinkState("idle"), 2000);
    } catch {
      setShareLinkState("error");
      window.setTimeout(() => setShareLinkState("idle"), 2000);
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size={size}
              className="shrink-0"
              onClick={() => void handleShareSegment()}
              aria-label={intl.formatMessage(contentEditorEditorPanelMessages.shareSegmentAria)}
            />
          }
        >
          {shareLinkState === "copied" ? (
            <HugeiconsIcon icon={Tick02Icon} className={iconClassName} />
          ) : (
            <HugeiconsIcon icon={LinkSquare02Icon} className={iconClassName} />
          )}
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
