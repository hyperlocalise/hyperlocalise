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
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  VISUAL_CATALOG_CATEGORY_ORDER,
  VISUAL_NODE_CATALOG,
  type VisualNodeCatalogItem,
} from "@/lib/visual-workflows/mock/node-catalog";
import type { VisualCatalogCategory, VisualCatalogType } from "@/lib/visual-workflows/mock/types";
import { cn } from "@/lib/primitives/cn";

import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";

export function VisualWorkflowNodePicker({
  queryFilter,
  disableTriggers,
  onPick,
}: {
  queryFilter?: string;
  disableTriggers: boolean;
  onPick: (type: VisualCatalogType) => void;
}) {
  const intl = useIntl();
  const [query, setQuery] = useState(queryFilter ?? "");
  const normalized = query.trim().toLowerCase();

  const grouped = useMemo(() => {
    const matches = VISUAL_NODE_CATALOG.filter((item) => {
      const title = intl.formatMessage(titleFor(item.type));
      const hint = intl.formatMessage(hintFor(item.type));
      if (!normalized) {
        return true;
      }
      return `${title} ${hint} ${item.type}`.toLowerCase().includes(normalized);
    });

    return VISUAL_CATALOG_CATEGORY_ORDER.flatMap((category) => {
      const items = matches.filter((item) => item.category === category);
      return items.length > 0 ? [{ category, items }] : [];
    });
  }, [intl, normalized]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium text-foreground">
          <FormattedMessage {...messages.pickerTitle} />
        </h2>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={intl.formatMessage(messages.pickerSearch)}
          className="mt-3"
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {grouped.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">
              <FormattedMessage {...messages.pickerEmpty} />
            </p>
          ) : (
            grouped.map((group) => (
              <section key={group.category} className="grid gap-1.5">
                <h3 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {intl.formatMessage(categoryMessage(group.category))}
                </h3>
                {group.items.map((item) => (
                  <PickerRow
                    key={item.type}
                    item={item}
                    disabled={!item.enabled || (disableTriggers && item.category === "trigger")}
                    onPick={onPick}
                  />
                ))}
              </section>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function PickerRow({
  item,
  disabled,
  onPick,
}: {
  item: VisualNodeCatalogItem;
  disabled: boolean;
  onPick: (type: VisualCatalogType) => void;
}) {
  const intl = useIntl();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(item.type)}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border border-transparent px-2 py-2 text-left hover:border-border hover:bg-muted/60",
        disabled
          ? "cursor-not-allowed opacity-50 hover:border-transparent hover:bg-transparent"
          : null,
      )}
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <HugeiconsIcon icon={item.icon} className="size-4" strokeWidth={1.8} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">
          {intl.formatMessage(titleFor(item.type))}
        </span>
        <span className="block text-xs text-muted-foreground">
          {disabled && !item.enabled
            ? intl.formatMessage(messages.comingSoon)
            : intl.formatMessage(hintFor(item.type))}
        </span>
      </span>
    </button>
  );
}

function titleFor(type: VisualCatalogType) {
  switch (type) {
    case "trigger.manual":
      return messages.nodeManualTrigger;
    case "action.http":
      return messages.nodeHttp;
    case "logic.if":
      return messages.nodeIf;
    case "ai.agent":
      return messages.nodeAi;
    case "logic.for_each":
      return messages.nodeLoop;
  }
}

function hintFor(type: VisualCatalogType) {
  switch (type) {
    case "trigger.manual":
      return messages.nodeManualTriggerHint;
    case "action.http":
      return messages.nodeHttpHint;
    case "logic.if":
      return messages.nodeIfHint;
    case "ai.agent":
      return messages.nodeAiHint;
    case "logic.for_each":
      return messages.nodeLoopHint;
  }
}

function categoryMessage(category: VisualCatalogCategory) {
  switch (category) {
    case "trigger":
      return messages.categoryTrigger;
    case "action":
      return messages.categoryAction;
    case "logic":
      return messages.categoryLogic;
    case "ai":
      return messages.categoryAi;
    case "flow":
      return messages.categoryFlow;
  }
}
