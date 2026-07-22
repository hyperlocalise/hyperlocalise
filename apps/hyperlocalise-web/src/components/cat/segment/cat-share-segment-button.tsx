"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";

import { catEditorPanelMessages } from "@/components/cat/shared/cat.messages";

export function CatShareSegmentButton({
  segmentShareUrl,
  size = "icon-sm",
}: {
  segmentShareUrl: string;
  size?: "icon-sm" | "icon-xs";
}) {
  const intl = useIntl();
  const [shareLinkState, setShareLinkState] = useState<"idle" | "copied" | "error">("idle");

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
    <Button
      type="button"
      variant="ghost"
      size={size}
      onClick={() => void handleShareSegment()}
      aria-label={intl.formatMessage(catEditorPanelMessages.shareSegmentAria)}
      title={
        shareLinkState === "copied"
          ? intl.formatMessage(catEditorPanelMessages.shareSegmentCopied)
          : shareLinkState === "error"
            ? intl.formatMessage(catEditorPanelMessages.shareSegmentFailed)
            : intl.formatMessage(catEditorPanelMessages.shareSegment)
      }
    >
      {shareLinkState === "copied" ? (
        <CheckIcon className="size-4" />
      ) : (
        <HugeiconsIcon icon={LinkSquare02Icon} className="size-4" />
      )}
    </Button>
  );
}
