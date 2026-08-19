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

import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";

export const SLACK_CHANNEL_BROWSE_LIMIT = 200;
export const SLACK_CHANNEL_SEARCH_PAGE_LIMIT = 1000;
export const SLACK_CHANNEL_SEARCH_MAX_PAGES = 3;
export const SLACK_CHANNEL_SEARCH_MAX_RESULTS = 50;
export const SLACK_CHANNEL_RATE_LIMIT_RETRIES = 3;
export const SLACK_CHANNEL_RATE_LIMIT_MAX_WAIT_MS = 2000;

export type SlackChannelListItem = { id: string; name: string; private: boolean };

export type SlackChannelSearchError =
  | { code: "slack_http_error"; status: number }
  | { code: "slack_api_error"; slackError: string }
  | { code: "slack_rate_limited" }
  | { code: "bot_unavailable"; cause: unknown };

type SlackChannel = { id?: string; name?: string; is_private?: boolean; is_archived?: boolean };

type SlackConversationsListResponse = {
  ok?: boolean;
  error?: string;
  channels?: SlackChannel[];
  response_metadata?: { next_cursor?: string };
};

type SlackConversationsInfoResponse = {
  ok?: boolean;
  error?: string;
  channel?: SlackChannel;
};

type SlackJsonResponse = SlackConversationsListResponse & SlackConversationsInfoResponse;

export function toCanonicalSlackChannelId(channelId: string) {
  return channelId.startsWith("slack:") ? channelId : `slack:${channelId}`;
}

export function fromCanonicalSlackChannelId(channelId: string) {
  return channelId.startsWith("slack:") ? channelId.slice("slack:".length) : channelId;
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseRetryAfterMs(response: Response) {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) {
    return 1000;
  }

  const seconds = Number(retryAfter);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 1000;
  }

  return Math.min(Math.ceil(seconds * 1000), SLACK_CHANNEL_RATE_LIMIT_MAX_WAIT_MS);
}

function toChannelListItem(channel: SlackChannel): SlackChannelListItem | null {
  if (!channel.id || !channel.name || channel.is_archived) {
    return null;
  }

  return {
    id: toCanonicalSlackChannelId(channel.id),
    name: channel.name,
    private: Boolean(channel.is_private),
  };
}

function channelMatchesQuery(channel: SlackChannelListItem, query: string) {
  const normalizedQuery = query.trim().replace(/^#/, "").toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return channel.name.toLowerCase().includes(normalizedQuery);
}

async function fetchSlackJson(
  url: URL,
  botToken: string,
  options: {
    signal?: AbortSignal;
    sleep: (ms: number) => Promise<void>;
  },
): Promise<Result<SlackJsonResponse, SlackChannelSearchError>> {
  for (let attempt = 0; attempt <= SLACK_CHANNEL_RATE_LIMIT_RETRIES; attempt += 1) {
    const responseResult = await fromThrowableAsync(
      fetch(url, {
        headers: { authorization: `Bearer ${botToken}` },
        redirect: "error",
        signal: options.signal,
      }),
    );
    if (isErr(responseResult)) {
      return err({ code: "bot_unavailable", cause: responseResult.error });
    }

    const response = responseResult.value;
    if (response.status === 429) {
      if (attempt === SLACK_CHANNEL_RATE_LIMIT_RETRIES) {
        return err({ code: "slack_rate_limited" });
      }
      await options.sleep(parseRetryAfterMs(response));
      continue;
    }

    if (!response.ok) {
      return err({ code: "slack_http_error", status: response.status });
    }

    const bodyResult = await fromThrowableAsync(response.json() as Promise<SlackJsonResponse>);
    if (isErr(bodyResult)) {
      return err({ code: "bot_unavailable", cause: bodyResult.error });
    }

    const body = bodyResult.value;
    if (!body.ok) {
      if (body.error === "ratelimited") {
        if (attempt === SLACK_CHANNEL_RATE_LIMIT_RETRIES) {
          return err({ code: "slack_rate_limited" });
        }
        await options.sleep(parseRetryAfterMs(response));
        continue;
      }

      return err({ code: "slack_api_error", slackError: body.error ?? "unknown" });
    }

    return ok(body);
  }

  return err({ code: "slack_rate_limited" });
}

async function loadSelectedSlackChannel(
  botToken: string,
  channelId: string,
  options: {
    signal?: AbortSignal;
    sleep: (ms: number) => Promise<void>;
  },
): Promise<Result<SlackChannelListItem | null, SlackChannelSearchError>> {
  const slackChannelId = fromCanonicalSlackChannelId(channelId);
  if (!slackChannelId) {
    return ok(null);
  }

  const url = new URL("https://slack.com/api/conversations.info");
  url.searchParams.set("channel", slackChannelId);

  const bodyResult = await fetchSlackJson(url, botToken, options);
  if (isErr(bodyResult)) {
    if (
      bodyResult.error.code === "slack_api_error" &&
      bodyResult.error.slackError === "channel_not_found"
    ) {
      return ok(null);
    }
    return bodyResult;
  }

  return ok(toChannelListItem(bodyResult.value.channel ?? {}));
}

async function listSlackChannelPage(
  botToken: string,
  input: {
    cursor?: string;
    limit: number;
    signal?: AbortSignal;
    sleep: (ms: number) => Promise<void>;
  },
): Promise<
  Result<{ channels: SlackChannelListItem[]; nextCursor: string }, SlackChannelSearchError>
> {
  const url = new URL("https://slack.com/api/conversations.list");
  url.searchParams.set("exclude_archived", "true");
  url.searchParams.set("limit", String(input.limit));
  url.searchParams.set("types", "public_channel,private_channel");
  if (input.cursor) {
    url.searchParams.set("cursor", input.cursor);
  }

  const bodyResult = await fetchSlackJson(url, botToken, {
    signal: input.signal,
    sleep: input.sleep,
  });
  if (isErr(bodyResult)) {
    return bodyResult;
  }

  const channels: SlackChannelListItem[] = [];
  for (const channel of bodyResult.value.channels ?? []) {
    const item = toChannelListItem(channel);
    if (item) {
      channels.push(item);
    }
  }

  return ok({
    channels,
    nextCursor: bodyResult.value.response_metadata?.next_cursor ?? "",
  });
}

function mergeSlackChannels(
  selected: SlackChannelListItem | null,
  channels: SlackChannelListItem[],
) {
  const merged = new Map<string, SlackChannelListItem>();
  if (selected) {
    merged.set(selected.id, selected);
  }
  for (const channel of channels) {
    merged.set(channel.id, channel);
  }

  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export async function searchSlackChannels(input: {
  botToken: string;
  query?: string;
  selectedChannelId?: string;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}): Promise<Result<SlackChannelListItem[], SlackChannelSearchError>> {
  const sleep = input.sleep ?? defaultSleep;
  const query = input.query?.trim() ?? "";

  const selectedResult = input.selectedChannelId
    ? await loadSelectedSlackChannel(input.botToken, input.selectedChannelId, {
        signal: input.signal,
        sleep,
      })
    : ok(null);
  if (isErr(selectedResult)) {
    return selectedResult;
  }

  if (!query) {
    const pageResult = await listSlackChannelPage(input.botToken, {
      limit: SLACK_CHANNEL_BROWSE_LIMIT,
      signal: input.signal,
      sleep,
    });
    if (isErr(pageResult)) {
      return pageResult;
    }

    return ok(mergeSlackChannels(selectedResult.value, pageResult.value.channels));
  }

  const matches: SlackChannelListItem[] = [];
  let cursor = "";

  for (let page = 0; page < SLACK_CHANNEL_SEARCH_MAX_PAGES; page += 1) {
    const pageResult = await listSlackChannelPage(input.botToken, {
      cursor,
      limit: SLACK_CHANNEL_SEARCH_PAGE_LIMIT,
      signal: input.signal,
      sleep,
    });
    if (isErr(pageResult)) {
      return pageResult;
    }

    for (const channel of pageResult.value.channels) {
      if (channelMatchesQuery(channel, query)) {
        matches.push(channel);
        if (matches.length >= SLACK_CHANNEL_SEARCH_MAX_RESULTS) {
          return ok(mergeSlackChannels(selectedResult.value, matches));
        }
      }
    }

    cursor = pageResult.value.nextCursor;
    if (!cursor) {
      break;
    }
  }

  return ok(mergeSlackChannels(selectedResult.value, matches));
}
