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

import type { MarkdownSlashCommandItem } from "./markdown-description-editor-slash-items";
import { createMarkdownSlashCommandSuggestionRender } from "./markdown-description-editor-slash-list";

export type MarkdownSlashCommandConfig = {
  resolveItems: (query: string) => MarkdownSlashCommandItem[];
  emptyLabel: string;
};

const markdownSlashCommandPluginKey = new PluginKey("markdownSlashCommand");

export function createMarkdownSlashCommandExtension(getConfig: () => MarkdownSlashCommandConfig) {
  const renderSuggestion = createMarkdownSlashCommandSuggestionRender(() => getConfig().emptyLabel);

  return Extension.create({
    name: "markdownSlashCommand",

    addProseMirrorPlugins() {
      return [
        Suggestion<MarkdownSlashCommandItem, MarkdownSlashCommandItem>({
          editor: this.editor,
          pluginKey: markdownSlashCommandPluginKey,
          char: "/",
          allowedPrefixes: [" "],
          startOfLine: false,
          floatingUi: {
            strategy: "fixed",
          },
          items: ({ query }) => getConfig().resolveItems(query),
          command: ({ editor, range, props }) => {
            props.run({ editor, range });
          },
          render: renderSuggestion,
        }),
      ];
    },
  });
}
