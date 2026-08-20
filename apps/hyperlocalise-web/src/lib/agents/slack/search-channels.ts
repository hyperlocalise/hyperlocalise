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

import {
  fromCanonicalSlackChannelId,
  parseSlackConversationId,
  toCanonicalSlackChannelId,
} from "./channel-query";

export {
  fromCanonicalSlackChannelId,
  normalizeSlackChannelQuery,
  parseSlackConversationId,
  toCanonicalSlackChannelId,
} from "./channel-query";

export const SLACK_CHANNEL_RATE_LIMIT_RETRIES = 3;
export const SLACK_CHANNEL_RATE_LIMIT_MAX_WAIT_MS = 2000;

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

type SlackConversationsInfoResponse = {
  ok?: boolean;
  error?: string;
  channel?: SlackChannel;
};

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
  if (channel.is_archived) {
    return null;
  }

  const name = channel.name || channel.name_normalized;
  if (!channel.id || !name) {
    return null;
  }

  return {
    id: toCanonicalSlackChannelId(channel.id),
    name,
    private: Boolean(channel.is_private),
  };
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
): Promise<Result<SlackConversationsInfoResponse, SlackChannelSearchError>> {
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

    const bodyResult = await fromThrowableAsync(
      response.json() as Promise<SlackConversationsInfoResponse>,
    );
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

export async function verifySlackChannel(input: {
  botToken: string;
  channelId: string;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}): Promise<Result<SlackChannelListItem | null, SlackChannelSearchError>> {
  const parsedChannelId = parseSlackConversationId(input.channelId);
  if (!parsedChannelId) {
    return ok(null);
  }

  const url = new URL("https://slack.com/api/conversations.info");
  url.searchParams.set("channel", fromCanonicalSlackChannelId(parsedChannelId));

  const bodyResult = await fetchSlackJson(url, input.botToken, {
    signal: input.signal,
    sleep: input.sleep ?? defaultSleep,
  });
  if (isErr(bodyResult)) {
    if (isSlackChannelLookupMiss(bodyResult.error)) {
      return ok(null);
    }
    return bodyResult;
  }

  return ok(toChannelListItem(bodyResult.value.channel ?? {}));
}
