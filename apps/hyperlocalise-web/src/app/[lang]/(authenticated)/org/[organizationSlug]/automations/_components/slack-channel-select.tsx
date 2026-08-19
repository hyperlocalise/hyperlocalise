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
import { useEffect, useState } from "react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { workspaceAutomationFormMessages } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/workspace-automation-form.messages";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  mergeVisibleSlackChannels,
  type SlackChannelQueryTarget,
} from "@/lib/agents/slack/channel-query";
import { createApiClient } from "@/lib/api-client";
import { cn } from "@/lib/primitives/cn";

const api = createApiClient();
const SLACK_CHANNEL_SEARCH_DEBOUNCE_MS = 300;

type SlackChannelOption = SlackChannelQueryTarget & { private: boolean };

async function fetchSlackChannels(input: {
  channelId?: string;
  organizationSlug: string;
  query?: string;
}) {
  const response = await api.api.orgs[":organizationSlug"]["agent-slack"].channels.$get({
    param: { organizationSlug: input.organizationSlug },
    query: {
      q: input.query || undefined,
      channelId: input.channelId || undefined,
    },
  });
  if (response.status !== 200) {
    throw new Error("Failed to load Slack channels");
  }
  const body = await response.json();
  return body.channels as SlackChannelOption[];
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debouncedValue;
}

function slackChannelLabel(
  intl: ReturnType<typeof useIntl>,
  channel: SlackChannelOption | undefined,
  fallbackId: string,
) {
  if (!channel) {
    return fallbackId
      ? fallbackId
      : intl.formatMessage(workspaceAutomationFormMessages.selectChannel);
  }

  return channel.private
    ? intl.formatMessage(workspaceAutomationFormMessages.privateChannelSuffix, {
        name: channel.name,
      })
    : intl.formatMessage(workspaceAutomationFormMessages.publicChannelLabel, {
        name: channel.name,
      });
}

export function SlackChannelSelect({
  disabled,
  error,
  onChange,
  organizationSlug,
  slackConnected,
  value,
}: {
  disabled?: boolean;
  error?: string;
  onChange: (channelId: string) => void;
  organizationSlug: string;
  slackConnected: boolean;
  value: string;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, SLACK_CHANNEL_SEARCH_DEBOUNCE_MS);
  const trimmedQuery = query.trim();
  const trimmedDebouncedQuery = debouncedQuery.trim();

  const browseQuery = useQuery({
    queryKey: ["slack-agent-channels", organizationSlug, value],
    queryFn: () =>
      fetchSlackChannels({
        organizationSlug,
        channelId: value || undefined,
      }),
    enabled: slackConnected,
  });

  const searchQuery = useQuery({
    queryKey: ["slack-agent-channels-search", organizationSlug, trimmedDebouncedQuery],
    queryFn: () =>
      fetchSlackChannels({
        organizationSlug,
        query: trimmedDebouncedQuery,
      }),
    enabled: slackConnected && open && Boolean(trimmedDebouncedQuery),
  });

  const browseChannels = browseQuery.data ?? [];
  const remoteChannels = trimmedQuery ? (searchQuery.data ?? []) : [];
  const visibleChannels = mergeVisibleSlackChannels(browseChannels, remoteChannels, query);
  const selectedChannel =
    browseChannels.find((channel) => channel.id === value) ??
    remoteChannels.find((channel) => channel.id === value);
  const isBrowseLoading = browseQuery.isLoading && browseQuery.data === undefined;
  const isRemoteSearchPending =
    Boolean(trimmedQuery) &&
    visibleChannels.length === 0 &&
    (searchQuery.isFetching || trimmedDebouncedQuery !== trimmedQuery);
  const triggerDisabled = disabled || !slackConnected || (isBrowseLoading && !selectedChannel);

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">
        <FormattedMessage {...workspaceAutomationFormMessages.channelLabel} />
      </Label>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setQuery("");
          }
        }}
      >
        <PopoverTrigger
          disabled={triggerDisabled}
          render={
            <Button
              type="button"
              variant="outline"
              disabled={triggerDisabled}
              className="h-8 w-full justify-between rounded-lg px-2.5 font-normal"
            />
          }
        >
          <span className="min-w-0 truncate">
            {isBrowseLoading && !selectedChannel && !value
              ? intl.formatMessage(workspaceAutomationFormMessages.loadingChannels)
              : slackChannelLabel(intl, selectedChannel, value)}
          </span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className="size-4 shrink-0 text-muted-foreground"
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0" sideOffset={4}>
          <Command shouldFilter={false}>
            <CommandInput
              autoFocus
              placeholder={intl.formatMessage(
                workspaceAutomationFormMessages.searchChannelPlaceholder,
              )}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty className="px-3 text-pretty">
                {isBrowseLoading || isRemoteSearchPending
                  ? intl.formatMessage(workspaceAutomationFormMessages.loadingChannels)
                  : trimmedQuery
                    ? intl.formatMessage(workspaceAutomationFormMessages.noMatchingChannels)
                    : intl.formatMessage(workspaceAutomationFormMessages.noChannelsFound)}
              </CommandEmpty>
              <CommandGroup>
                {visibleChannels.map((channel) => (
                  <CommandItem
                    key={channel.id}
                    value={`${channel.name} ${channel.id}`}
                    data-checked={value === channel.id || undefined}
                    onSelect={() => {
                      onChange(channel.id);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className={cn("min-w-0 flex-1 truncate")}>
                      {slackChannelLabel(intl, channel, channel.id)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
