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
import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/primitives/cn";

import { issueSourcePathPickerMessages as messages } from "./issue-source-path-picker.messages";
import { buildIssueSourcePathOptions } from "./issue-source-path-options";
import { useIssueSourceFilesQuery } from "./use-issue-source-files";

const CLEAR_SOURCE_PATH_VALUE = "__clear_source_path__";

export function IssueSourcePathPicker({
  organizationSlug,
  projectId,
  value,
  emptyValue,
  disabled = false,
  triggerClassName,
  onChange,
}: {
  organizationSlug: string;
  projectId: string;
  value: string | null;
  emptyValue: string;
  disabled?: boolean;
  triggerClassName?: string;
  onChange: (sourcePath: string | null) => void;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const filesQuery = useIssueSourceFilesQuery({
    organizationSlug,
    projectId,
  });
  const options = buildIssueSourcePathOptions(filesQuery.data ?? [], value);
  const triggerLabel = value?.trim() ? value : emptyValue;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            aria-label={intl.formatMessage(messages.triggerAria)}
            className={cn("justify-between gap-2 font-normal", triggerClassName)}
          />
        }
      >
        <span className="min-w-0 truncate text-left">{triggerLabel}</span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground"
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0" sideOffset={4}>
        <Command>
          <CommandInput placeholder={intl.formatMessage(messages.searchPlaceholder)} />
          <CommandList>
            <CommandEmpty>
              {filesQuery.isLoading ? (
                <FormattedMessage {...messages.loading} />
              ) : (
                <FormattedMessage {...messages.empty} />
              )}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={`${CLEAR_SOURCE_PATH_VALUE} no file`}
                data-checked={!value?.trim() || undefined}
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <FormattedMessage {...messages.clear} />
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading={intl.formatMessage(messages.filesGroup)}>
              {options.map((file) => (
                <CommandItem
                  key={file.sourcePath}
                  value={`${file.sourcePath} ${file.filename}`}
                  data-checked={value === file.sourcePath || undefined}
                  onSelect={() => {
                    onChange(file.sourcePath);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="block truncate">{file.filename}</span>
                    {file.filename !== file.sourcePath ? (
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {file.sourcePath}
                      </span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
