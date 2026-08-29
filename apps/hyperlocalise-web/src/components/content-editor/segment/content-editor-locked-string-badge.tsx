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

import { contentEditorLockedStringMessages } from "@/components/content-editor/shared/content-editor.messages";

export function ContentEditorLockedStringBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-muted-foreground/30 font-normal text-muted-foreground", className)}
    >
      <FormattedMessage {...contentEditorLockedStringMessages.locked} />
    </Badge>
  );
}
