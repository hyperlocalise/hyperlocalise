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
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/primitives/cn";

import { useContentEditorGrouping } from "./content-editor-grouping-context";
import { groupMessages as m } from "./content-editor-groups.messages";

export function ContentEditorGroupingViewSwitcher({ compact = false }: { compact?: boolean }) {
  const grouping = useContentEditorGrouping();
  const intl = useIntl();

  if (!grouping) {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <Select
        value={grouping.view}
        onValueChange={(value) => {
          if (value === "individual" || value === "grouped") {
            grouping.changeView(value);
          }
        }}
      >
        <SelectTrigger
          size={compact ? "sm" : "default"}
          aria-label={intl.formatMessage(m.view)}
          className={cn(compact && "font-normal text-xs")}
        >
          <SelectValue>{intl.formatMessage(m[grouping.view])}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="individual">
              <FormattedMessage {...m.individual} />
            </SelectItem>
            <SelectItem value="grouped">
              <FormattedMessage {...m.grouped} />
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {grouping.preference ? (
        <Button
          variant="ghost"
          size="sm"
          className={compact ? "h-8 px-2 text-xs" : undefined}
          onClick={() => grouping.changeView(null)}
        >
          <FormattedMessage {...m.projectDefault} />
        </Button>
      ) : null}
    </div>
  );
}
