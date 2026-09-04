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
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";
import {
  BookOpenTextIcon,
  Building06Icon,
  Cancel01Icon,
  DatabaseIcon,
  FilterIcon,
  FolderLibraryIcon,
  Key01Icon,
  PuzzleIcon,
  UserGroup02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  V1_ACTIVITY_EVENT_TYPES,
  type V1ActivityEventType,
} from "@/lib/activity-log/activity-log-contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/primitives/cn";

import { activityLogsPageContentMessages as messages } from "./activity-logs-page-content.messages";

type EventTypeGroup = {
  eventTypes: readonly V1ActivityEventType[];
  icon: typeof UserGroup02Icon;
  label: MessageDescriptor;
};

const eventTypeGroups: readonly EventTypeGroup[] = [
  {
    icon: UserGroup02Icon,
    label: messages.membershipEventGroup,
    eventTypes: ["member_invited", "member_invite_resent", "member_role_changed", "member_removed"],
  },
  { icon: Building06Icon, label: messages.workspaceEventGroup, eventTypes: ["workspace_updated"] },
  {
    icon: Key01Icon,
    label: messages.accessEventGroup,
    eventTypes: ["personal_access_token_created", "personal_access_token_revoked"],
  },
  {
    icon: PuzzleIcon,
    label: messages.integrationEventGroup,
    eventTypes: ["integration_connected", "integration_disconnected"],
  },
  {
    icon: FolderLibraryIcon,
    label: messages.projectEventGroup,
    eventTypes: [
      "project_created",
      "project_archived",
      "project_deleted",
      "project_settings_changed",
    ],
  },
  {
    icon: BookOpenTextIcon,
    label: messages.glossaryEventGroup,
    eventTypes: [
      "glossary_created",
      "glossary_deleted",
      "glossary_imported",
      "glossary_exported",
      "glossary_project_attached",
      "glossary_project_detached",
    ],
  },
  {
    icon: DatabaseIcon,
    label: messages.translationMemoryEventGroup,
    eventTypes: [
      "translation_memory_created",
      "translation_memory_deleted",
      "translation_memory_imported",
      "translation_memory_exported",
      "translation_memory_project_attached",
      "translation_memory_project_detached",
    ],
  },
];

const eventTypeLabel = (eventType: string) =>
  eventType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export function ActivityLogEventTypeFilter({
  value,
  onChange,
}: {
  value: V1ActivityEventType[];
  onChange: (value: V1ActivityEventType[]) => void;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(value), [value]);

  const toggleEventType = (eventType: V1ActivityEventType) => {
    const next = new Set(selected);
    if (next.has(eventType)) next.delete(eventType);
    else next.add(eventType);
    onChange(V1_ACTIVITY_EVENT_TYPES.filter((item) => next.has(item)));
  };

  const selectedPreview = value.slice(0, 2).map(eventTypeLabel).join(", ");
  const remainingCount = value.length - 2;

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-9 w-full justify-between gap-3 py-2 text-start"
              aria-label={intl.formatMessage(messages.eventTypeLabel)}
            />
          }
        >
          <span className="flex min-w-0 items-center gap-2">
            <HugeiconsIcon icon={FilterIcon} strokeWidth={2} className="size-3.5 shrink-0" />
            <span className="truncate">
              {value.length === 0 ? (
                <FormattedMessage {...messages.allEventTypes} />
              ) : (
                <span className="flex items-center gap-2">
                  <span className="truncate">{selectedPreview}</span>
                  {remainingCount > 0 ? <Badge variant="secondary">+{remainingCount}</Badge> : null}
                </span>
              )}
            </span>
          </span>
          {value.length > 0 ? (
            <Badge variant="outline" className="shrink-0">
              {intl.formatMessage(messages.selectedEventTypes, { count: value.length })}
            </Badge>
          ) : null}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] gap-3 p-2">
          <PopoverHeader className="flex-row items-center justify-between px-2 pt-1">
            <PopoverTitle className="flex items-center gap-2 text-sm font-medium">
              <HugeiconsIcon icon={FilterIcon} strokeWidth={2} className="size-3.5 text-primary" />
              <FormattedMessage {...messages.eventTypePickerTitle} />
            </PopoverTitle>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onChange([...V1_ACTIVITY_EVENT_TYPES])}
                disabled={value.length === V1_ACTIVITY_EVENT_TYPES.length}
              >
                <FormattedMessage {...messages.selectAllEventTypes} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onChange([])}
                disabled={value.length === 0}
              >
                <FormattedMessage {...messages.clearEventTypes} />
              </Button>
            </div>
          </PopoverHeader>
          <Command>
            <CommandInput placeholder={intl.formatMessage(messages.searchEventTypes)} />
            <CommandList>
              <CommandEmpty>
                <FormattedMessage {...messages.noMatchingEventTypes} />
              </CommandEmpty>
              {eventTypeGroups.map((group) => (
                <CommandGroup
                  key={group.label.id}
                  heading={
                    <span className="flex items-center gap-2">
                      <HugeiconsIcon
                        icon={group.icon}
                        strokeWidth={1.8}
                        className="size-3.5 text-muted-foreground"
                      />
                      <span>{intl.formatMessage(group.label)}</span>
                    </span>
                  }
                >
                  {group.eventTypes.map((eventType) => {
                    const label = eventTypeLabel(eventType);
                    const isSelected = selected.has(eventType);
                    return (
                      <CommandItem
                        key={eventType}
                        value={label}
                        data-checked={isSelected}
                        aria-checked={isSelected}
                        onSelect={() => toggleEventType(eventType)}
                        className={cn("gap-3", isSelected && "bg-muted/60")}
                      >
                        <Checkbox checked={isSelected} tabIndex={-1} aria-label={label} />
                        <span className="truncate">{label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" aria-live="polite">
          {value.slice(0, 3).map((eventType) => {
            const label = eventTypeLabel(eventType);
            return (
              <Badge key={eventType} variant="secondary" className="max-w-full gap-1 pl-2">
                <span className="truncate">{label}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="-mr-1 rounded-full"
                  aria-label={intl.formatMessage(messages.removeEventType, { eventType: label })}
                  onClick={() => toggleEventType(eventType)}
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                </Button>
              </Badge>
            );
          })}
          {value.length > 3 ? <Badge variant="outline">+{value.length - 3} more</Badge> : null}
        </div>
      ) : null}
    </div>
  );
}
