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

/**
 * Redacted snapshots of live Customer.io App API responses (US region,
 * captured 2026-10-28) used as test fixtures. Long HTML `body` strings are
 * truncated with a `__truncated` marker; all keys, ids, types, and language
 * tags are faithful to the live payloads.
 *
 * Notable live shapes:
 * - Broadcast list items embed a nested `actions` summary (`{id, type}`).
 * - Broadcast action list mixes `push` (default language, empty body) with
 *   `in_app` default + translated variants (out of localisation scope).
 * - Single-action detail endpoints wrap in `{action: {...}}` (broadcasts,
 *   campaigns) or `{content: {...}}` (newsletters, transactional), unlike the
 *   flat list items.
 */

export const REAL_BROADCASTS_LIST = {
  broadcasts: [
    {
      id: 2,
      deduplicate_id: "2:1793155740",
      name: "Test Broadcase",
      description: "",
      type: "triggered_broadcast",
      created: 1793155628,
      updated: 1793155740,
      active: false,
      state: "draft",
      actions: [
        { id: 14, type: "push" },
        { id: 15, type: "22" },
        { id: 16, type: "22" },
      ],
      first_started: 0,
      tags: null,
      scheduled_start: 0,
      scheduled_start_should_backfill: false,
      scheduled_stop: 0,
      scheduled_stop_should_sunset: false,
    },
  ],
};

export const REAL_BROADCAST_ACTIONS_LIST = {
  actions: [
    {
      id: "14",
      broadcast_id: 2,
      deduplicate_id: "9:1793155639",
      name: "Push 1",
      layout: "",
      body: "",
      created: 1793155639,
      updated: 1793155740,
      type: "push",
      sending_state: "draft",
      language: "",
      recipient: "last_used",
      subject: "",
      custom_payload: false,
      payload_ios: "",
      payload_android: "",
    },
    {
      id: 15,
      broadcast_id: 2,
      deduplicate_id: "10:1793155732",
      name: "In-App Message 1",
      type: "in_app",
      language: "",
      body: "<!doctype html><html>__truncated_16822__</html>",
      updated: 1793155740,
    },
    {
      id: 16,
      broadcast_id: 2,
      deduplicate_id: "11:1793155740",
      name: "In-App Message 1",
      type: "in_app",
      language: "zh-CN",
      body: "<!doctype html><html>__truncated_16822__</html>",
      updated: 1793155740,
    },
  ],
};

export const REAL_NEWSLETTERS_LIST = {
  newsletters: [
    {
      id: 1,
      deduplicate_id: "1:1793114102",
      content_ids: [2],
      name: "Weekly Update",
      sent_at: 1793114102,
      send_state: "sent",
      scheduled_at: null,
      created: 1793113977,
      updated: 1793114102,
      type: "email",
      tags: [],
    },
  ],
  next: null,
};

export const REAL_NEWSLETTER_CONTENTS_LIST = {
  contents: [
    {
      id: 2,
      name: "Weekly Update",
      type: "email",
      language: "",
      subject: "Weekly Update",
      preheader_text: "",
      body: "<!doctype html><html>__truncated_7125__</html>",
      updated: 1793114102,
    },
  ],
};

export const REAL_TRANSACTIONAL_LIST = {
  messages: [
    {
      id: 1,
      name: "All uncategorized email messages",
      description: "",
      send_to_unsubscribed: true,
      link_tracking: true,
      open_tracking: true,
      hide_message_body: false,
      queue_drafts: false,
      trigger_name: "",
      created_at: 1793110369,
      updated_at: 1793110369,
    },
    {
      id: 2,
      name: "Test",
      description: "",
      send_to_unsubscribed: false,
      link_tracking: false,
      open_tracking: false,
      hide_message_body: false,
      queue_drafts: false,
      trigger_name: "",
      created_at: 1793110400,
      updated_at: 1793110400,
    },
  ],
};

export const REAL_BROADCAST_ACTION_DETAIL = {
  action: {
    id: "14",
    broadcast_id: 2,
    deduplicate_id: "9:1793155639",
    name: "Push 1",
    type: "push",
    language: "",
    layout: "",
    body: "",
    subject: "",
    recipient: "last_used",
    sending_state: "draft",
    created: 1793155639,
    updated: 1793155740,
  },
};

export const REAL_NEWSLETTER_CONTENT_DETAIL = {
  content: {
    id: 2,
    newsletter_id: 1,
    deduplicate_id: "2:1793114102",
    name: "Weekly Update",
    type: "email",
    language: "",
    subject: "Weekly Update",
    preheader_text: "",
    body: "<!doctype html><html>__truncated_7125__</html>",
    created: 1793113977,
    updated: 1793114102,
  },
};
