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
export const SLACK_CHANNEL_SEARCH_EXACT_MAX_PAGES = 10;
export const SLACK_CHANNEL_SEARCH_MAX_RESULTS = 50;
export const SLACK_CHANNEL_RATE_LIMIT_RETRIES = 3;
export const SLACK_CHANNEL_RATE_LIMIT_MAX_WAIT_MS = 2000;

const SLACK_CONVERSATION_ID_PATTERN = /^(?:slack:)?[CGD][A-Z0-9]{8,}$/i;
const SLACK_CHANNEL_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const SLACK_CHANNEL_LOOKUP_MISS_ERRORS = new Set([
  "channel_not_found",
  "invalid_arguments",
  "invalid_name",
]);

export type SlackChannelListItem = { id: string; name: string; private: boolean };

export type SlackChannelSearchError =
  | { code: "slack_http_error"; status: number }
  | { code: "slack_api_error"; slackError: string }
  | { code: "slack_rate_limited" }
  | { code: "bot_unavailable"; cause: unknown };

type SlackChannel = {
  id?: string;
  name?: string;
  name_normalized?: string;
  is_private?: boolean;
  is_archived?: boolean;
};

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

type SlackRequestOptions = {
  signal?: AbortSignal;
  sleep: (ms: number) => Promise<void>;
};

export function toCanonicalSlackChannelId(channelId: string) {
  return channelId.startsWith("slack:") ? channelId : `slack:${channelId}`;
}

export function fromCanonicalSlackChannelId(channelId: string) {
  return channelId.startsWith("slack:") ? channelId.slice("slack:".length) : channelId;
}

export function normalizeSlackChannelQuery(query: string) {
  return query.trim().replace(/^#/, "").toLowerCase();
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
  const name = channel.name || channel.name_normalized;
  if (!channel.id || !name || channel.is_archived) {
    return null;
  }

  return {
    id: toCanonicalSlackChannelId(channel.id),
    name,
    private: Boolean(channel.is_private),
  };
}

function isExactChannelMatch(channel: SlackChannelListItem, query: string) {
  const normalizedQuery = normalizeSlackChannelQuery(query);
  if (!normalizedQuery) {
    return false;
  }

  return (
    channel.name.toLowerCase() === normalizedQuery ||
    fromCanonicalSlackChannelId(channel.id).toLowerCase() === normalizedQuery
  );
}

function channelMatchesQuery(channel: SlackChannelListItem, query: string) {
  const normalizedQuery = normalizeSlackChannelQuery(query);
  if (!normalizedQuery) {
    return true;
  }

  return (
    channel.name.toLowerCase().includes(normalizedQuery) ||
    fromCanonicalSlackChannelId(channel.id).toLowerCase().includes(normalizedQuery)
  );
}

function slackChannelLookupKeys(query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  if (SLACK_CONVERSATION_ID_PATTERN.test(trimmed)) {
    return [fromCanonicalSlackChannelId(trimmed)];
  }

  const name = normalizeSlackChannelQuery(trimmed);
  if (SLACK_CHANNEL_NAME_PATTERN.test(name)) {
    return [`#${name}`];
  }

  return [];
}

function isSlackChannelLookupMiss(error: SlackChannelSearchError) {
  if (error.code === "slack_http_error" && error.status === 404) {
    return true;
  }

  return error.code === "slack_api_error" && SLACK_CHANNEL_LOOKUP_MISS_ERRORS.has(error.slackError);
}

async function fetchSlackJson(
  url: URL,
  botToken: string,
  options: SlackRequestOptions,
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

async function loadSlackChannelByKey(
  botToken: string,
  channelKey: string,
  options: SlackRequestOptions,
): Promise<Result<SlackChannelListItem | null, SlackChannelSearchError>> {
  if (!channelKey) {
    return ok(null);
  }

  const url = new URL("https://slack.com/api/conversations.info");
  url.searchParams.set("channel", channelKey);

  const bodyResult = await fetchSlackJson(url, botToken, options);
  if (isErr(bodyResult)) {
    if (isSlackChannelLookupMiss(bodyResult.error)) {
      return ok(null);
    }
    return bodyResult;
  }

  return ok(toChannelListItem(bodyResult.value.channel ?? {}));
}

async function lookupSlackChannelByQuery(
  botToken: string,
  query: string,
  options: SlackRequestOptions,
): Promise<Result<SlackChannelListItem | null, SlackChannelSearchError>> {
  for (const key of slackChannelLookupKeys(query)) {
    const lookupResult = await loadSlackChannelByKey(botToken, key, options);
    if (isErr(lookupResult)) {
      // Speculative name/id lookup must not fail the search; list scan can still match.
      if (
        lookupResult.error.code === "slack_rate_limited" ||
        lookupResult.error.code === "bot_unavailable"
      ) {
        return lookupResult;
      }
      continue;
    }
    if (lookupResult.value) {
      return lookupResult;
    }
  }

  return ok(null);
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
  query = "",
) {
  const merged = new Map<string, SlackChannelListItem>();
  for (const channel of channels) {
    merged.set(channel.id, channel);
  }
  if (selected) {
    merged.set(selected.id, selected);
  }

  const normalizedQuery = normalizeSlackChannelQuery(query);
  return [...merged.values()].sort((left, right) => {
    if (normalizedQuery) {
      const leftExact = isExactChannelMatch(left, normalizedQuery);
      const rightExact = isExactChannelMatch(right, normalizedQuery);
      if (leftExact !== rightExact) {
        return leftExact ? -1 : 1;
      }
    }

    return left.name.localeCompare(right.name);
  });
}

export async function searchSlackChannels(input: {
  botToken: string;
  query?: string;
  selectedChannelId?: string;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}): Promise<Result<SlackChannelListItem[], SlackChannelSearchError>> {
  const sleep = input.sleep ?? defaultSleep;
  const options: SlackRequestOptions = { signal: input.signal, sleep };
  const query = input.query?.trim() ?? "";

  let selectedChannel: SlackChannelListItem | null = null;
  if (input.selectedChannelId) {
    const selectedResult = await loadSlackChannelByKey(
      input.botToken,
      fromCanonicalSlackChannelId(input.selectedChannelId),
      options,
    );
    if (isErr(selectedResult)) {
      return selectedResult;
    }
    selectedChannel = selectedResult.value;
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

    return ok(mergeSlackChannels(selectedChannel, pageResult.value.channels));
  }

  const lookupPromise = lookupSlackChannelByQuery(input.botToken, query, options);
  const firstPagePromise = listSlackChannelPage(input.botToken, {
    limit: SLACK_CHANNEL_SEARCH_PAGE_LIMIT,
    signal: input.signal,
    sleep,
  });
  const [lookupResult, firstPageResult] = await Promise.all([lookupPromise, firstPagePromise]);
  if (isErr(lookupResult)) {
    return lookupResult;
  }
  if (isErr(firstPageResult)) {
    return firstPageResult;
  }

  const matches: SlackChannelListItem[] = [];
  if (lookupResult.value && channelMatchesQuery(lookupResult.value, query)) {
    matches.push(lookupResult.value);
  }
  for (const channel of firstPageResult.value.channels) {
    if (channelMatchesQuery(channel, query)) {
      matches.push(channel);
    }
  }

  let cursor = firstPageResult.value.nextCursor;
  const hasExactMatch = () => matches.some((channel) => isExactChannelMatch(channel, query));

  if (matches.length >= SLACK_CHANNEL_SEARCH_MAX_RESULTS || hasExactMatch() || !cursor) {
    return ok(mergeSlackChannels(selectedChannel, matches, query));
  }

  for (let page = 1; page < SLACK_CHANNEL_SEARCH_EXACT_MAX_PAGES; page += 1) {
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
          return ok(mergeSlackChannels(selectedChannel, matches, query));
        }
      }
    }

    cursor = pageResult.value.nextCursor;
    if (!cursor || hasExactMatch()) {
      break;
    }
  }

  return ok(mergeSlackChannels(selectedChannel, matches, query));
}
