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
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import type { UIMessage } from "ai";

import { workspaceAutomations } from "./agents";
import { messageSenderTypeEnum } from "./enums";
import { organizations, users } from "./organizations";

/**
 * Stores one person's chat with the automation assistant about one automation. A session is read
 * and written by its author alone, and is kept apart from the conversations the Inbox lists.
 */
export const automationAssistantSessions = pgTable(
  "automation_assistant_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Null while the automation the session is about has not been saved.
    automationId: uuid("automation_id").references(() => workspaceAutomations.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    // A session bound to no automation is deleted once this passes.
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    // Set while a turn runs, so a session runs one turn at a time.
    turnStartedAt: timestamp("turn_started_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    // One session per saved automation and author. Unbound sessions hold no automation id, and
    // rows without one never collide.
    uniqueIndex("idx_automation_assistant_sessions_automation_author").on(
      table.automationId,
      table.createdByUserId,
    ),
    index("idx_automation_assistant_sessions_author_expires").on(
      table.createdByUserId,
      table.expiresAt,
    ),
  ],
);

/**
 * Stores the messages of an automation assistant session: what the person asked and what the
 * assistant replied, with the reply's parts so the page can show what each turn changed.
 */
export const automationAssistantMessages = pgTable(
  "automation_assistant_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => automationAssistantSessions.id, { onDelete: "cascade" }),
    senderType: messageSenderTypeEnum("sender_type").notNull(),
    text: text("text").notNull(),
    parts: jsonb("parts").$type<UIMessage["parts"]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_automation_assistant_messages_session_created").on(table.sessionId, table.createdAt),
  ],
);
