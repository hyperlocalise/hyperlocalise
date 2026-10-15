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
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { workspaceAutomationFormMessages } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/workspace-automation-form.messages";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseSlackConversationId } from "@/lib/agents/slack/channel-query";
import { createApiClient } from "@/lib/api-client";
import { cn } from "@/lib/primitives/cn";

const api = createApiClient();
const SLACK_CHANNEL_VERIFY_DEBOUNCE_MS = 400;

type VerifiedSlackChannel = { id: string; name: string; private: boolean };

async function fetchVerifiedSlackChannel(input: {
  channelId: string;
  organizationSlug: string;
}): Promise<VerifiedSlackChannel | null> {
  const response = await api.api.orgs[":organizationSlug"]["agent-slack"].channels.verify.$get({
    param: { organizationSlug: input.organizationSlug },
    query: { channelId: input.channelId },
  });
  if (response.status === 404) {
    // Slack not being connected is also a 404, and says nothing about the channel.
    const body = await response.json();
    if ("error" in body && body.error === "slack_channel_not_found") {
      return null;
    }
    throw new Error("Failed to verify Slack channel");
  }
  if (response.status !== 200) {
    throw new Error("Failed to verify Slack channel");
  }
  const body = await response.json();
  return body.channel as VerifiedSlackChannel;
}

function slackChannelVerifyQueryOptions(organizationSlug: string, channelId: string) {
  return {
    queryKey: ["slack-channel-verify", organizationSlug, channelId],
    queryFn: () => fetchVerifiedSlackChannel({ channelId, organizationSlug }),
  };
}

/**
 * Whether Slack says the channel does not exist, asked before a save. It shares the field's own
 * lookup, so a channel the field has just checked is not asked about twice. A lookup that fails
 * is not an answer, and does not count.
 */
export async function isSlackChannelMissing(input: {
  channelId: string;
  organizationSlug: string;
  queryClient: QueryClient;
}): Promise<boolean> {
  const parsedChannelId = parseSlackConversationId(input.channelId);
  if (!parsedChannelId) {
    return false;
  }
  try {
    const channel = await input.queryClient.fetchQuery({
      ...slackChannelVerifyQueryOptions(input.organizationSlug, parsedChannelId),
      // A save does not wait on retries.
      retry: false,
    });
    return channel === null;
  } catch {
    return false;
  }
}

function slackChannelLabel(
  intl: ReturnType<typeof useIntl>,
  channel: VerifiedSlackChannel | undefined,
) {
  if (!channel) {
    return null;
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
  const [draft, setDraft] = useState(value);
  const [debouncedDraft, setDebouncedDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);

  if (value !== lastValue) {
    setLastValue(value);
    // Typing has already put this value in the draft. Anything else (undo, discard, the
    // assistant) replaces the draft at once, with no pause before it is checked.
    if (value !== draft.trim()) {
      setDraft(value);
      setDebouncedDraft(value);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedDraft(draft);
    }, SLACK_CHANNEL_VERIFY_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [draft]);

  const parsedChannelId = parseSlackConversationId(debouncedDraft.trim());
  const verifyQuery = useQuery({
    ...slackChannelVerifyQueryOptions(organizationSlug, parsedChannelId ?? ""),
    enabled: slackConnected && Boolean(parsedChannelId),
  });

  const verifiedChannel = verifyQuery.isSuccess ? verifyQuery.data : undefined;
  const showInvalidFormat = slackConnected && debouncedDraft.trim().length > 0 && !parsedChannelId;
  const showNotFound =
    slackConnected &&
    Boolean(parsedChannelId) &&
    !verifyQuery.isLoading &&
    verifyQuery.isSuccess &&
    verifyQuery.data === null;
  const verificationError = verifyQuery.isError
    ? intl.formatMessage(workspaceAutomationFormMessages.slackChannelVerifyFailed)
    : undefined;
  // The field's own message for a bad ID or a missing channel says more than the save's.
  const saveError = showInvalidFormat || showNotFound ? undefined : error;
  const helperError = saveError ?? verificationError;
  const verifiedLabel = verifiedChannel === null ? null : slackChannelLabel(intl, verifiedChannel);

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">
        <FormattedMessage {...workspaceAutomationFormMessages.channelLabel} />
      </Label>
      <Input
        aria-invalid={Boolean(helperError || showInvalidFormat || showNotFound) || undefined}
        disabled={disabled || !slackConnected}
        placeholder={intl.formatMessage(workspaceAutomationFormMessages.channelIdPlaceholder)}
        value={draft}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          setDraft(nextValue);
          onChange(nextValue.trim());
        }}
        spellCheck={false}
        autoComplete="off"
        className="h-8 font-mono text-sm"
      />
      {verifyQuery.isLoading && parsedChannelId ? (
        <p className="text-xs text-muted-foreground">
          <FormattedMessage {...workspaceAutomationFormMessages.verifyingChannel} />
        </p>
      ) : null}
      {verifiedLabel ? (
        <p className={cn("text-xs text-muted-foreground")}>{verifiedLabel}</p>
      ) : null}
      {/* The ones a save is refused for carry the mark the editor scrolls to. */}
      {showInvalidFormat ? (
        <p data-slot="field-error" className="text-xs text-destructive">
          <FormattedMessage {...workspaceAutomationFormMessages.invalidChannelId} />
        </p>
      ) : null}
      {showNotFound ? (
        <p data-slot="field-error" className="text-xs text-destructive">
          <FormattedMessage {...workspaceAutomationFormMessages.channelNotFound} />
        </p>
      ) : null}
      {helperError ? (
        <p data-slot={saveError ? "field-error" : undefined} className="text-xs text-destructive">
          {helperError}
        </p>
      ) : null}
      {!helperError && !showInvalidFormat && !showNotFound && !verifiedLabel ? (
        <p className="text-xs text-muted-foreground">
          <FormattedMessage {...workspaceAutomationFormMessages.channelIdHelp} />
        </p>
      ) : null}
    </div>
  );
}
