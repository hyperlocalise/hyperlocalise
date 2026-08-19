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

import {
  err,
  fromThrowableAsync,
  isErr,
  isOk,
  ok,
  type Result,
} from "@/lib/primitives/result/results";

import {
  fromCanonicalSlackChannelId,
  isExactSlackChannelMatch,
  normalizeSlackChannelQuery,
  parseSlackConversationId,
  SLACK_CHANNEL_NAME_PATTERN,
  slackChannelMatchKeys,
  slackChannelMatchesQuery,
  toCanonicalSlackChannelId,
} from "./channel-query";

export {
  fromCanonicalSlackChannelId,
  normalizeSlackChannelQuery,
  parseSlackConversationId,
  toCanonicalSlackChannelId,
} from "./channel-query";

export const SLACK_CHANNEL_LIST_PAGE_LIMIT = 200;
export const SLACK_CHANNEL_BROWSE_LIMIT = SLACK_CHANNEL_LIST_PAGE_LIMIT;
export const SLACK_CHANNEL_SEARCH_PAGE_LIMIT = SLACK_CHANNEL_LIST_PAGE_LIMIT;
export const SLACK_CHANNEL_SEARCH_MAX_PAGES = 3;
export const SLACK_CHANNEL_SEARCH_EXACT_MAX_PAGES = 10;
export const SLACK_CHANNEL_SEARCH_MAX_RESULTS = 50;
export const SLACK_CHANNEL_RATE_LIMIT_RETRIES = 3;
export const SLACK_CHANNEL_RATE_LIMIT_MAX_WAIT_MS = 2000;
export const SLACK_CHANNEL_LIST_CACHE_TTL_MS = 60_000;
const SLACK_CHANNEL_LIST_CACHE_MAX_ENTRIES = 50;

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

function slackChannelLookupKeys(query: string) {
  const channelId = parseSlackConversationId(query);
  if (channelId) {
    return [channelId];
  }

  const keys: string[] = [];
  const seen = new Set<string>();
  for (const name of slackChannelMatchKeys(query)) {
    if (!SLACK_CHANNEL_NAME_PATTERN.test(name) || seen.has(name)) {
      continue;
    }
    seen.add(name);
    keys.push(`#${name}`);
  }
  return keys;
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
  const keys = slackChannelLookupKeys(query);
  if (keys.length === 0) {
    return ok(null);
  }

  for (const key of keys) {
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
  // Slack applies exclude_archived after filling a virtual page of `limit`, so a
  // page can return fewer than `limit` channels while next_cursor still has more.
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

type SlackChannelListSnapshot = {
  channels: SlackChannelListItem[];
  nextCursor: string;
  fetchedAt: number;
};

// In-memory conversations.list snapshot keyed by Slack team id. Do not store
// this in Postgres: names and private membership change, and a DB row would
// still miss the first fetch that 429s. A 60s TTL absorbs picker typing.
const slackChannelListCache = new Map<string, SlackChannelListSnapshot>();

export function clearSlackChannelListCache() {
  slackChannelListCache.clear();
}

function cloneSlackChannelListSnapshot(
  snapshot: SlackChannelListSnapshot,
): SlackChannelListSnapshot {
  return {
    channels: [...snapshot.channels],
    nextCursor: snapshot.nextCursor,
    fetchedAt: snapshot.fetchedAt,
  };
}

function readSlackChannelListCache(cacheKey: string | undefined, now: number, allowStale: boolean) {
  if (!cacheKey) {
    return null;
  }

  const entry = slackChannelListCache.get(cacheKey);
  if (!entry) {
    return null;
  }

  const isFresh = now - entry.fetchedAt <= SLACK_CHANNEL_LIST_CACHE_TTL_MS;
  if (!isFresh && !allowStale) {
    return null;
  }

  return cloneSlackChannelListSnapshot(entry);
}

function writeSlackChannelListCache(
  cacheKey: string | undefined,
  snapshot: SlackChannelListSnapshot,
) {
  if (!cacheKey) {
    return;
  }

  if (
    !slackChannelListCache.has(cacheKey) &&
    slackChannelListCache.size >= SLACK_CHANNEL_LIST_CACHE_MAX_ENTRIES
  ) {
    const oldestKey = slackChannelListCache.keys().next().value;
    if (oldestKey) {
      slackChannelListCache.delete(oldestKey);
    }
  }

  slackChannelListCache.set(cacheKey, cloneSlackChannelListSnapshot(snapshot));
}

function appendSlackChannelListPage(
  snapshot: SlackChannelListSnapshot,
  page: { channels: SlackChannelListItem[]; nextCursor: string },
  now: number,
) {
  const seenIds = new Set(snapshot.channels.map((channel) => channel.id));
  for (const channel of page.channels) {
    if (!seenIds.has(channel.id)) {
      snapshot.channels.push(channel);
      seenIds.add(channel.id);
    }
  }
  snapshot.nextCursor = page.nextCursor;
  snapshot.fetchedAt = now;
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
      const leftExact = isExactSlackChannelMatch(left, normalizedQuery);
      const rightExact = isExactSlackChannelMatch(right, normalizedQuery);
      if (leftExact !== rightExact) {
        return leftExact ? -1 : 1;
      }
    }

    return left.name.localeCompare(right.name);
  });
}

export async function searchSlackChannels(input: {
  botToken: string;
  cacheKey?: string;
  query?: string;
  selectedChannelId?: string;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}): Promise<Result<SlackChannelListItem[], SlackChannelSearchError>> {
  const sleep = input.sleep ?? defaultSleep;
  const options: SlackRequestOptions = { signal: input.signal, sleep };
  const query = input.query?.trim() ?? "";
  const now = Date.now();
  let snapshot = readSlackChannelListCache(input.cacheKey, now, false);
  let canPageFurther = true;

  const fetchListPage = async (
    cursor: string | undefined,
    limit: number,
  ): Promise<Result<void, SlackChannelSearchError>> => {
    const pageResult = await listSlackChannelPage(input.botToken, {
      cursor,
      limit,
      signal: input.signal,
      sleep,
    });
    if (isErr(pageResult)) {
      if (pageResult.error.code === "slack_rate_limited") {
        const stale = snapshot ?? readSlackChannelListCache(input.cacheKey, Date.now(), true);
        if (stale && stale.channels.length > 0) {
          snapshot = stale;
          canPageFurther = false;
          return ok(undefined);
        }
      }
      return pageResult;
    }

    if (!snapshot) {
      snapshot = { channels: [], nextCursor: "", fetchedAt: Date.now() };
    }
    appendSlackChannelListPage(snapshot, pageResult.value, Date.now());
    writeSlackChannelListCache(input.cacheKey, snapshot);
    return ok(undefined);
  };

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
    if (!snapshot) {
      const browseResult = await fetchListPage(undefined, SLACK_CHANNEL_LIST_PAGE_LIMIT);
      if (isErr(browseResult)) {
        return browseResult;
      }
    }

    for (let page = 1; page < SLACK_CHANNEL_SEARCH_EXACT_MAX_PAGES; page += 1) {
      if (
        (snapshot?.channels.length ?? 0) >= SLACK_CHANNEL_BROWSE_LIMIT ||
        !snapshot?.nextCursor ||
        !canPageFurther
      ) {
        break;
      }

      const moreResult = await fetchListPage(snapshot.nextCursor, SLACK_CHANNEL_LIST_PAGE_LIMIT);
      if (isErr(moreResult)) {
        return moreResult;
      }
    }

    return ok(
      mergeSlackChannels(
        selectedChannel,
        (snapshot?.channels ?? []).slice(0, SLACK_CHANNEL_BROWSE_LIMIT),
      ),
    );
  }

  const lookupPromise = lookupSlackChannelByQuery(input.botToken, query, options);
  const firstPagePromise: Promise<Result<void, SlackChannelSearchError>> = snapshot
    ? Promise.resolve(ok(undefined))
    : fetchListPage(undefined, SLACK_CHANNEL_LIST_PAGE_LIMIT);
  const [lookupResult, firstPageResult] = await Promise.all([lookupPromise, firstPagePromise]);
  if (isErr(lookupResult)) {
    if (
      lookupResult.error.code !== "slack_rate_limited" ||
      !snapshot ||
      snapshot.channels.length === 0
    ) {
      return lookupResult;
    }
  }
  if (isErr(firstPageResult)) {
    return firstPageResult;
  }

  const matches: SlackChannelListItem[] = [];
  const seenIds = new Set<string>();
  const pushMatch = (channel: SlackChannelListItem) => {
    if (seenIds.has(channel.id)) {
      return;
    }
    if (
      !isExactSlackChannelMatch(channel, query) &&
      matches.length >= SLACK_CHANNEL_SEARCH_MAX_RESULTS
    ) {
      return;
    }
    seenIds.add(channel.id);
    matches.push(channel);
  };

  if (isOk(lookupResult) && lookupResult.value) {
    pushMatch(lookupResult.value);
  }
  for (const channel of snapshot?.channels ?? []) {
    if (slackChannelMatchesQuery(channel, query)) {
      pushMatch(channel);
    }
  }

  const hasExactMatch = () => matches.some((channel) => isExactSlackChannelMatch(channel, query));

  for (let page = 1; page < SLACK_CHANNEL_SEARCH_EXACT_MAX_PAGES; page += 1) {
    if (hasExactMatch() || !snapshot?.nextCursor || !canPageFurther) {
      break;
    }

    const pageResult = await fetchListPage(snapshot.nextCursor, SLACK_CHANNEL_LIST_PAGE_LIMIT);
    if (isErr(pageResult)) {
      return pageResult;
    }

    for (const channel of snapshot?.channels ?? []) {
      if (slackChannelMatchesQuery(channel, query)) {
        pushMatch(channel);
      }
    }
  }

  return ok(mergeSlackChannels(selectedChannel, matches, query));
}
