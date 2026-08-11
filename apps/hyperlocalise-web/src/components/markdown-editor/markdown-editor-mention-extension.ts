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
import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";

import { createMarkdownMentionSuggestionRender } from "./markdown-editor-mention-list";
import {
  mentionHrefForIssue,
  mentionHrefForUser,
  type MarkdownMentionConfig,
  type MarkdownMentionSuggestion,
} from "./markdown-editor-mention-types";

const markdownMentionPluginKey = new PluginKey("markdownMention");

export function createMarkdownMentionExtension(getConfig: () => MarkdownMentionConfig | null) {
  const renderSuggestion = createMarkdownMentionSuggestionRender(() => {
    const config = getConfig();
    return {
      emptyLabel: config?.emptyLabel ?? "No matches",
      usersSectionLabel: config?.usersSectionLabel ?? "Users",
      issuesSectionLabel: config?.issuesSectionLabel ?? "Issues",
    };
  });

  return Extension.create({
    name: "markdownMention",

    addProseMirrorPlugins() {
      return [
        Suggestion<MarkdownMentionSuggestion, MarkdownMentionSuggestion>({
          editor: this.editor,
          pluginKey: markdownMentionPluginKey,
          char: "@",
          allowedPrefixes: [" ", "\n"],
          startOfLine: false,
          debounce: 200,
          floatingUi: {
            strategy: "fixed",
          },
          items: async ({ query }) => {
            const config = getConfig();
            if (!config) {
              return [];
            }
            const result = await config.search(query);
            return [...result.users, ...result.issues];
          },
          command: ({ editor, range, props }) => {
            const label = props.kind === "user" ? props.displayName : props.title;
            const href =
              props.kind === "user"
                ? mentionHrefForUser(props.userId)
                : mentionHrefForIssue(props.issueId, props.projectId);

            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                {
                  type: "text",
                  text: `@${label}`,
                  marks: [{ type: "link", attrs: { href } }],
                },
                { type: "text", text: " " },
              ])
              .run();
          },
          render: renderSuggestion,
        }),
      ];
    },
  });
}
