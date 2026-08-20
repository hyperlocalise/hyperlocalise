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
import type { IntlShape } from "react-intl";
import { Copy01Icon, Link01Icon, StopCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { assertNever } from "@/lib/primitives/assert-never/assert-never";
import { cn } from "@/lib/primitives/cn";

import { issueRelationshipKindMessages as messages } from "./issue-relationship-kind.messages";
import type { IssueRelationshipPresentedKind } from "./use-issue-relationships-query";

/** Single source of truth for relationship-kind copy — do not add per-component label maps. */
export function relationshipKindLabel(
  intl: IntlShape,
  kind: IssueRelationshipPresentedKind,
): string {
  switch (kind) {
    case "related":
      return intl.formatMessage(messages.related);
    case "blocks":
      return intl.formatMessage(messages.blocks);
    case "blocked_by":
      return intl.formatMessage(messages.blockedBy);
    case "duplicate_of":
      return intl.formatMessage(messages.duplicateOf);
    case "duplicate":
      return intl.formatMessage(messages.duplicates);
    default:
      return assertNever(kind);
  }
}

const KIND_ICON: Record<IssueRelationshipPresentedKind, typeof Link01Icon> = {
  related: Link01Icon,
  blocks: StopCircleIcon,
  blocked_by: StopCircleIcon,
  duplicate_of: Copy01Icon,
  duplicate: Copy01Icon,
};

// blocked_by mirrors the blocks glyph so the pair reads as opposite directions of the
// same relationship, not two unrelated icons.
const KIND_ICON_CLASS_NAME: Record<IssueRelationshipPresentedKind, string> = {
  related: "text-muted-foreground",
  blocks: "text-amber-500",
  blocked_by: "text-red-500 -scale-x-100",
  duplicate_of: "text-muted-foreground",
  duplicate: "text-muted-foreground",
};

export function IssueRelationshipKindIcon({
  kind,
  className,
}: {
  kind: IssueRelationshipPresentedKind;
  className?: string;
}) {
  return (
    <HugeiconsIcon
      icon={KIND_ICON[kind]}
      strokeWidth={1.8}
      className={cn("size-3.5 shrink-0", KIND_ICON_CLASS_NAME[kind], className)}
    />
  );
}
