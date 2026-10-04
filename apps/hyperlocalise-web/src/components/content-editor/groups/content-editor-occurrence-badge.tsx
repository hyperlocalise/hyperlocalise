"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/primitives/cn";

import { groupMessages as m } from "./content-editor-groups.messages";

/** Marks a grouped row whose translation is saved to several identical strings. */
export function ContentEditorOccurrenceBadge({
  count,
  divergent = false,
  className,
}: {
  count: number;
  /** The occurrences do not share one translation in the current locale. */
  divergent?: boolean;
  className?: string;
}) {
  const intl = useIntl();
  const label = intl.formatMessage(divergent ? m.occurrencesDivergent : m.occurrences, { count });
  return (
    <Badge
      variant={divergent ? "warning" : "secondary"}
      title={label}
      aria-label={label}
      className={cn("h-5 px-1.5 font-mono font-normal text-[0.625rem]", className)}
    >
      <FormattedMessage {...m.occurrenceBadge} values={{ count }} />
    </Badge>
  );
}
