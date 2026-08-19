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

const SLACK_CONVERSATION_ID_PATTERN = /^(?:slack:)?[CGD][A-Z0-9]{8,}$/i;
const SLACK_ARCHIVE_CHANNEL_PATTERN = /\/archives\/([CGD][A-Z0-9]{8,})/i;
const SLACK_MENTION_CHANNEL_PATTERN = /<#([CGD][A-Z0-9]{8,})(?:\|[^>]*)?>/i;
export const SLACK_CHANNEL_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;

export type SlackChannelQueryTarget = { id: string; name: string };

export function toCanonicalSlackChannelId(channelId: string) {
  return channelId.startsWith("slack:") ? channelId : `slack:${channelId}`;
}

export function fromCanonicalSlackChannelId(channelId: string) {
  return channelId.startsWith("slack:") ? channelId.slice("slack:".length) : channelId;
}

export function normalizeSlackChannelQuery(query: string) {
  return query.trim().replace(/^#/, "").toLowerCase();
}

export function parseSlackConversationId(query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  if (SLACK_CONVERSATION_ID_PATTERN.test(trimmed)) {
    return fromCanonicalSlackChannelId(trimmed);
  }

  const archiveMatch = trimmed.match(SLACK_ARCHIVE_CHANNEL_PATTERN);
  if (archiveMatch?.[1]) {
    return archiveMatch[1];
  }

  const mentionMatch = trimmed.match(SLACK_MENTION_CHANNEL_PATTERN);
  if (mentionMatch?.[1]) {
    return mentionMatch[1];
  }

  return null;
}

export function slackChannelMatchKeys(value: string) {
  const normalized = normalizeSlackChannelQuery(value);
  if (!normalized) {
    return [];
  }

  const keys = [normalized];
  if (/\s/u.test(normalized)) {
    keys.push(normalized.replace(/\s+/g, "-"), normalized.replace(/\s+/g, "_"));
  }
  return keys;
}

function slackChannelCompactKey(value: string) {
  return normalizeSlackChannelQuery(value).replace(/[\s_-]+/g, "");
}

export function isExactSlackChannelMatch(channel: SlackChannelQueryTarget, query: string) {
  const queryKeys = slackChannelMatchKeys(query);
  if (queryKeys.length === 0) {
    return false;
  }

  const name = channel.name.toLowerCase();
  const id = fromCanonicalSlackChannelId(channel.id).toLowerCase();
  return queryKeys.includes(name) || queryKeys.includes(id);
}

export function slackChannelMatchesQuery(channel: SlackChannelQueryTarget, query: string) {
  if (isExactSlackChannelMatch(channel, query)) {
    return true;
  }

  const normalizedQuery = normalizeSlackChannelQuery(query);
  if (!normalizedQuery) {
    return true;
  }

  const conversationId = parseSlackConversationId(query);
  if (conversationId) {
    return fromCanonicalSlackChannelId(channel.id).toLowerCase() === conversationId.toLowerCase();
  }

  const name = channel.name.toLowerCase();
  const id = fromCanonicalSlackChannelId(channel.id).toLowerCase();
  const nameCompact = slackChannelCompactKey(channel.name);
  const queryCompact = slackChannelCompactKey(normalizedQuery);

  if (nameCompact.includes(queryCompact) || id.includes(normalizedQuery)) {
    return true;
  }

  return slackChannelMatchKeys(query).some((key) => name.includes(key) || id.includes(key));
}

export function mergeVisibleSlackChannels<T extends SlackChannelQueryTarget>(
  browse: T[],
  remote: T[],
  query: string,
): T[] {
  const merged = new Map<string, T>();
  for (const channel of browse) {
    if (slackChannelMatchesQuery(channel, query)) {
      merged.set(channel.id, channel);
    }
  }
  for (const channel of remote) {
    if (slackChannelMatchesQuery(channel, query)) {
      merged.set(channel.id, channel);
    }
  }

  return [...merged.values()].toSorted((left, right) => {
    if (query.trim()) {
      const leftExact = isExactSlackChannelMatch(left, query);
      const rightExact = isExactSlackChannelMatch(right, query);
      if (leftExact !== rightExact) {
        return leftExact ? -1 : 1;
      }
    }

    return left.name.localeCompare(right.name);
  });
}
