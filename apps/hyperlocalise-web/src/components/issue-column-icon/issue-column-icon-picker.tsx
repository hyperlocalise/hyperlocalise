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
import { useMemo, useState } from "react";
import { SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/primitives/cn";
import {
  filterIssueSheetColumnIcons,
  type IssueSheetColumnIconId,
} from "@/lib/projects/issue-sheet/issue-sheet-column-icons";

import { IssueColumnIcon } from "./issue-column-icon";
import { issueColumnIconPickerMessages as messages } from "./issue-column-icon-picker.messages";

export function IssueColumnIconPicker({
  value,
  disabled = false,
  allowClear = true,
  onChange,
}: {
  value: string | null;
  disabled?: boolean;
  allowClear?: boolean;
  onChange: (icon: IssueSheetColumnIconId | null) => void;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const icons = useMemo(() => filterIssueSheetColumnIcons(query), [query]);
  const selectedId = value ?? null;

  return (
    <span className="inline-flex size-9 shrink-0">
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          if (disabled) {
            return;
          }
          setOpen(nextOpen);
          if (!nextOpen) {
            setQuery("");
          }
        }}
      >
        <PopoverTrigger
          disabled={disabled}
          render={
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled}
              aria-label={intl.formatMessage(messages.trigger)}
              className="size-9 rounded-lg"
            />
          }
        >
          <IssueColumnIcon iconId={selectedId} />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 gap-2 p-2">
          <PopoverHeader>
            <PopoverTitle className="px-1 text-sm">
              <FormattedMessage {...messages.title} />
            </PopoverTitle>
          </PopoverHeader>
          <InputGroup>
            <InputGroupInput
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={intl.formatMessage(messages.search)}
              aria-label={intl.formatMessage(messages.search)}
            />
            <InputGroupAddon>
              <HugeiconsIcon icon={SearchIcon} strokeWidth={2} />
            </InputGroupAddon>
          </InputGroup>
          {icons.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              <FormattedMessage {...messages.empty} />
            </p>
          ) : (
            <ScrollArea className="h-52">
              <div className="grid grid-cols-6 gap-1 p-1">
                {icons.map((iconId) => {
                  const isSelected = selectedId === iconId;
                  return (
                    <Button
                      key={iconId}
                      type="button"
                      size="icon-sm"
                      variant={isSelected ? "secondary" : "ghost"}
                      aria-label={iconId}
                      aria-pressed={isSelected}
                      className={cn(isSelected && "ring-1 ring-border")}
                      onClick={() => {
                        onChange(iconId);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <IssueColumnIcon iconId={iconId} />
                    </Button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
          {allowClear ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange(null);
                setOpen(false);
                setQuery("");
              }}
            >
              <FormattedMessage {...messages.clear} />
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </span>
  );
}
