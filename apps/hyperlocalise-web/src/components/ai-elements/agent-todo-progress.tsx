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
import { CheckCircle2Icon, CircleIcon } from "lucide-react";
import { FormattedMessage } from "react-intl";

import { Spinner } from "@/components/ui/spinner";
import type { AgentTodoItem } from "@/lib/agent-contracts/tool-context";
import { cn } from "@/lib/primitives/cn";

import { agentTodoProgressMessages } from "./agent-todo-progress.messages";

const TODO_STATUSES = new Set<AgentTodoItem["status"]>(["todo", "in-progress", "completed"]);

function isAgentTodoItem(value: unknown): value is AgentTodoItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.content === "string" &&
    typeof item.status === "string" &&
    TODO_STATUSES.has(item.status as AgentTodoItem["status"])
  );
}

export function getAgentTodoItems(value: unknown): AgentTodoItem[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const todos = (value as Record<string, unknown>).todos;
  if (!Array.isArray(todos) || todos.length === 0 || !todos.every(isAgentTodoItem)) {
    return null;
  }

  return todos;
}

function TodoStatusIcon({ status }: { status: AgentTodoItem["status"] }) {
  if (status === "completed") {
    return <CheckCircle2Icon className="size-4 text-green-600" />;
  }
  if (status === "in-progress") {
    return (
      <span className="size-4">
        <Spinner className="size-4" />
      </span>
    );
  }
  return <CircleIcon className="size-4 text-muted-foreground/60" />;
}

export function AgentTodoProgress({ items }: { items: AgentTodoItem[] }) {
  return (
    <section
      aria-live="polite"
      aria-relevant="text"
      className="mb-3 rounded-lg border border-border bg-muted/30 p-3"
      role="status"
    >
      <p className="mb-2 font-medium text-sm text-foreground">
        <FormattedMessage {...agentTodoProgressMessages.title} />
      </p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li className="flex items-start gap-2 text-sm" key={item.id}>
            <span aria-hidden="true" className="mt-0.5 shrink-0">
              <TodoStatusIcon status={item.status} />
            </span>
            <span
              className={cn(
                "text-foreground",
                item.status === "completed" && "text-muted-foreground line-through",
              )}
            >
              {item.content}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
