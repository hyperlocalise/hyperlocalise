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
import { CopyIcon, LinkIcon, StopCircleIcon } from "@phosphor-icons/react";

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

const KIND_ICON: Record<IssueRelationshipPresentedKind, typeof LinkIcon> = {
  related: LinkIcon,
  blocks: StopCircleIcon,
  blocked_by: StopCircleIcon,
  duplicate_of: CopyIcon,
  duplicate: CopyIcon,
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
  const Icon = KIND_ICON[kind];
  return <Icon className={cn("size-3.5 shrink-0", KIND_ICON_CLASS_NAME[kind], className)} />;
}
