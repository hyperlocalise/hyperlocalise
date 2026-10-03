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
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/primitives/cn";

import { formatCheckStatusClass } from "@/components/content-editor/segment/content-editor-tone";
import type { ContentEditorFormatCheck } from "@/components/content-editor/shared/types";

export function ContentEditorFormatCheckStatusIcon({
  status,
  className,
}: {
  status: ContentEditorFormatCheck["status"];
  className?: string;
}) {
  const iconClassName = cn("size-4 shrink-0", formatCheckStatusClass(status), className);

  switch (status) {
    case "pass":
      return <HugeiconsIcon icon={CheckmarkCircle02Icon} className={iconClassName} />;
    case "fail":
      return <HugeiconsIcon icon={AlertCircleIcon} className={iconClassName} />;
    default:
      return <HugeiconsIcon icon={InformationCircleIcon} className={iconClassName} />;
  }
}
