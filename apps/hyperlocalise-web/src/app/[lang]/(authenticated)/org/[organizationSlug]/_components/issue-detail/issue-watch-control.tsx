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
import { FormattedMessage } from "react-intl";

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

import { issueWatchControlMessages as messages } from "./issue-watch-control.messages";
import { useIssueSubscriptionMutations } from "./use-issue-subscription";
import { useIssueSubscribersQuery, type IssueSubscriber } from "./use-issue-subscribers-query";

const MAX_VISIBLE_SUBSCRIBERS = 3;

const AVATAR_FALLBACK_COLORS = [
  "bg-emerald-600 text-white",
  "bg-sky-600 text-white",
  "bg-violet-600 text-white",
  "bg-amber-600 text-white",
  "bg-rose-600 text-white",
  "bg-teal-600 text-white",
  "bg-indigo-600 text-white",
  "bg-orange-600 text-white",
] as const;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function avatarFallbackClassName(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return AVATAR_FALLBACK_COLORS[hash % AVATAR_FALLBACK_COLORS.length];
}

function SubscriberAvatar({ subscriber }: { subscriber: IssueSubscriber }) {
  return (
    <Avatar size="sm" className="size-[22px]" title={subscriber.displayName}>
      {subscriber.avatarUrl ? <AvatarImage src={subscriber.avatarUrl} alt="" /> : null}
      <AvatarFallback className={avatarFallbackClassName(subscriber.userId)}>
        {initials(subscriber.displayName)}
      </AvatarFallback>
    </Avatar>
  );
}

export function IssueWatchControl({
  organizationSlug,
  projectId,
  issueId,
  isWatching,
  disabled = false,
}: {
  organizationSlug: string;
  projectId: string;
  issueId: string;
  isWatching: boolean;
  disabled?: boolean;
}) {
  const subscribersQuery = useIssueSubscribersQuery({
    organizationSlug,
    projectId,
    issueId,
  });
  const { watch, unwatch, isPending } = useIssueSubscriptionMutations({
    organizationSlug,
    projectId,
    issueId,
  });

  const subscribers = subscribersQuery.data ?? [];
  const visibleSubscribers = subscribers.slice(0, MAX_VISIBLE_SUBSCRIBERS);
  const hiddenSubscriberCount = Math.max(0, subscribers.length - visibleSubscribers.length);

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled || isPending}
        className="h-auto px-0 text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
        onClick={() => {
          if (isWatching) {
            unwatch.mutate();
            return;
          }
          watch.mutate();
        }}
      >
        <FormattedMessage {...(isWatching ? messages.unsubscribe : messages.subscribe)} />
      </Button>
      {subscribers.length > 0 ? (
        <AvatarGroup>
          {visibleSubscribers.map((subscriber) => (
            <SubscriberAvatar key={subscriber.userId} subscriber={subscriber} />
          ))}
          {hiddenSubscriberCount > 0 ? (
            <AvatarGroupCount className="size-[22px] text-xs">
              +{hiddenSubscriberCount}
            </AvatarGroupCount>
          ) : null}
        </AvatarGroup>
      ) : null}
    </div>
  );
}
