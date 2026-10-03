"use client";
/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";

type Scope = {
  client: GoSvcClient;
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
};
type Selection = {
  segmentId?: string;
  groupId?: string;
  sourcePath?: string;
  sourcePaths?: string;
  targetLocale?: string;
  label: string;
};
type Activity = {
  id: string;
  eventType: string;
  createdAt: string;
  actor: { displayName: string };
  payload: Record<string, unknown>;
};
const ActivityContext = createContext<((selection: Selection) => void) | null>(null);

export function SegmentActivityButton(props: Selection) {
  const open = useContext(ActivityContext);
  if (!open) return null;
  return (
    <Button type="button" variant="ghost" size="sm" onClick={() => open(props)}>
      <FormattedMessage
        defaultMessage="Activity"
        id="r05vZ2Pf2x"
        description="Open segment or group activity"
      />
    </Button>
  );
}

export function SegmentActivityProvider({ children, ...scope }: Scope & { children: ReactNode }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  return (
    <ActivityContext value={setSelection}>
      {children}
      <Sheet
        open={Boolean(selection)}
        onOpenChange={(open) => {
          if (!open) setSelection(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selection ? (
            <ActivityPanel key={JSON.stringify(selection)} scope={scope} selection={selection} />
          ) : null}
        </SheetContent>
      </Sheet>
    </ActivityContext>
  );
}

function ActivityPanel({ scope, selection }: { scope: Scope; selection: Selection }) {
  const intl = useIntl();
  const [segmentId, setSegmentId] = useState(selection.segmentId);
  const query = {
    sourcePath: selection.sourcePath ?? scope.sourcePath,
    sourcePaths: selection.sourcePaths,
    targetLocale: selection.targetLocale ?? scope.targetLocale,
    segmentId,
    groupId: selection.groupId,
    limit: 50,
  };
  const logs = useInfiniteQuery({
    queryKey: ["content-editor-activity-logs", scope.organizationSlug, scope.projectId, query],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      scope.client.cat.activityLogs(
        scope.organizationSlug,
        scope.projectId,
        { ...query, cursor: pageParam },
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const events = (logs.data?.pages.flatMap((page) => page.activityLogs) ??
    []) as unknown as Activity[];
  const operations = new Map<string, Activity[]>();
  for (const event of events) {
    const key =
      typeof event.payload.operationId === "string" ? event.payload.operationId : event.id;
    const entries = operations.get(key) ?? [];
    entries.push(event);
    operations.set(key, entries);
  }
  const action = (type: string) => {
    switch (type) {
      case "string_segment_translation_updated":
        return intl.formatMessage({
          defaultMessage: "Updated translation",
          id: "Kn81SOzCXT",
          description: "Activity action",
        });
      case "string_segment_approved":
        return intl.formatMessage({
          defaultMessage: "Approved translation",
          id: "tqBVZwkSoj",
          description: "Activity action",
        });
      case "string_segment_locked":
        return intl.formatMessage({
          defaultMessage: "Locked occurrence",
          id: "n8Z1u75jlR",
          description: "Activity action",
        });
      case "string_segment_unlocked":
        return intl.formatMessage({
          defaultMessage: "Unlocked occurrence",
          id: "drd4ZLYQ5x",
          description: "Activity action",
        });
      case "string_segment_commented":
        return intl.formatMessage({
          defaultMessage: "Added a comment",
          id: "H2zytAspiB",
          description: "Activity action",
        });
      case "string_segment_hidden":
        return intl.formatMessage({
          defaultMessage: "Hid occurrence",
          id: "Ybuu2P0L4t",
          description: "Activity action",
        });
      case "string_segment_unhidden":
        return intl.formatMessage({
          defaultMessage: "Unhid occurrence",
          id: "FLx49NPlCh",
          description: "Activity action",
        });
      case "string_segment_status_changed":
        return intl.formatMessage({
          defaultMessage: "Changed status",
          id: "pydxPv6nE3",
          description: "Activity action",
        });
      default:
        return intl.formatMessage({
          defaultMessage: "Updated file",
          id: "vD5zGexbZO",
          description: "Activity fallback action",
        });
    }
  };
  return (
    <>
      <SheetHeader>
        <SheetTitle>
          <FormattedMessage
            defaultMessage="Activity"
            id="/PgmP2vFLd"
            description="Segment activity panel title"
          />
        </SheetTitle>
        <SheetDescription className="whitespace-pre-wrap break-words">
          {selection.label} · {query.targetLocale}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-3 px-6 pb-6">
        {selection.groupId && segmentId ? (
          <Button variant="outline" onClick={() => setSegmentId(undefined)}>
            <FormattedMessage
              defaultMessage="All occurrences"
              id="wu4jBnO8Ot"
              description="Return to group activity"
            />
          </Button>
        ) : null}
        {logs.isPending ? (
          <p role="status">
            <FormattedMessage
              defaultMessage="Loading activity…"
              id="WnNUs2UJBw"
              description="Activity loading"
            />
          </p>
        ) : logs.isError ? (
          <div role="alert">
            <p>
              <FormattedMessage
                defaultMessage="Activity could not be loaded."
                id="cqaNRGucU0"
                description="Activity load error"
              />
            </p>
            <Button onClick={() => void logs.refetch()}>
              <FormattedMessage
                defaultMessage="Retry"
                id="v5Pi713RSS"
                description="Retry activity"
              />
            </Button>
          </div>
        ) : events.length === 0 ? (
          <p>
            <FormattedMessage
              defaultMessage="No recorded activity for this occurrence and language."
              id="7ZwRKXo+Jx"
              description="Empty segment history"
            />
          </p>
        ) : null}
        {Array.from(operations.entries()).map(([key, entries]) => {
          const event = entries[0];
          const count = Array.isArray(event.payload.operationMemberIds)
            ? event.payload.operationMemberIds.length
            : entries.length;
          return (
            <article key={key} className="border-b py-3">
              <p className="font-medium">
                {event.actor.displayName} · {action(event.eventType)}
              </p>
              <p className="text-xs text-muted-foreground">
                {intl.formatDate(event.createdAt)} · {intl.formatTime(event.createdAt)}
              </p>
              {event.payload.operationId ? (
                <p className="text-xs">
                  <FormattedMessage
                    defaultMessage="Bulk apply · {count} occurrences"
                    id="Fuq0/iamLg"
                    description="Activity bulk operation size"
                    values={{ count }}
                  />
                </p>
              ) : null}
              {entries.map((entry) => (
                <div key={entry.id} className="mt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-all text-xs">
                      {typeof entry.payload.sourcePath === "string" ? entry.payload.sourcePath : ""}
                    </span>
                    {selection.groupId &&
                    !segmentId &&
                    typeof entry.payload.segmentId === "string" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSegmentId(String(entry.payload.segmentId))}
                      >
                        <FormattedMessage
                          defaultMessage="This occurrence"
                          id="ggh8otefhT"
                          description="Filter activity to an occurrence"
                        />
                      </Button>
                    ) : null}
                  </div>
                  {typeof entry.payload.nextStatus === "string" ? (
                    <p className="text-xs">{entry.payload.nextStatus}</p>
                  ) : null}
                </div>
              ))}
            </article>
          );
        })}
        {logs.hasNextPage ? (
          <Button disabled={logs.isFetchingNextPage} onClick={() => void logs.fetchNextPage()}>
            <FormattedMessage
              defaultMessage="Load more"
              id="dvLFHYhBkY"
              description="Load more segment activity"
            />
          </Button>
        ) : null}
      </div>
    </>
  );
}
