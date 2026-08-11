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
import type { KnowledgeMemoryRecord } from "@/api/routes/knowledge-memory/knowledge-memory.schema";
import { KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH } from "@/lib/knowledge-memory/knowledge-memory.shared";

import type { KnowledgeMemoryEditorViewProps } from "./knowledge-memory-editor-view";

export const japaneseKnowledgeContent = `## Tone
- Keep product copy practical and direct.
- Keep Hyperlocalise untranslated in every locale.

## Japanese voice
### ja-JP
- Write UI copy in です・ます調 and keep one register per screen.
- Prefer 「ご確認ください」 over 「ご確認いただけますでしょうか」, and never stack 二重敬語.
- Call the reader お客様 in billing and support copy, and drop the pronoun in button labels.

## Japanese glossary
### ja-JP
- workspace: ワークスペース, never 作業領域.
- job: ジョブ, including in help articles.
- string: テキスト in the product UI, 文字列 in developer documentation.

## Japanese formatting
### ja-JP
- Use 全角 punctuation (、。) with 半角 digits and Latin product names.
- Keep one 半角 space between Japanese text and Latin words, and none inside 全角 parentheses.
- Write dates as 2026年7月20日 and prices as ¥1,280（税込）.
`;

export const japanMarketPlaybookContent = `## Japan market playbook
### ja-JP
- Lead with review workflow and reliability: buyers ask who checks the output before they ask how fast it is.
- Show 税込 prices on every plan, and note that 請求書 and 銀行振込 are available next to card payment.
- Link 特定商取引法に基づく表記 from the footer of every marketing page.

## Japan launch calendar
### ja-JP
- Skip campaign sends during 年末年始 (Dec 29 to Jan 3), ゴールデンウィーク, and お盆.
- The fiscal year starts in April, so budget conversations land best in January and February.

## Japan support expectations
### ja-JP
- Reply within one 営業日, in Japanese, signed with the team name instead of an individual.
- Restate the reported issue and quote the 問い合わせ番号 before proposing a fix.
`;

export const knowledgeMemoryFixture: KnowledgeMemoryRecord = {
  revisionId: "11111111-1111-4111-8111-111111111111",
  version: 3,
  content: japaneseKnowledgeContent,
  summary: "Clarify ja-JP voice, glossary, and formatting",
  updatedAt: "2026-07-20T10:15:00.000Z",
  updatedByUserId: "user_fixture",
};

export const japanMarketPlaybookMemoryFixture: KnowledgeMemoryRecord = {
  revisionId: "22222222-2222-4222-8222-222222222222",
  version: 4,
  content: `${japaneseKnowledgeContent}\n${japanMarketPlaybookContent}`,
  summary: "Add Japan market playbook, calendar, and support expectations",
  updatedAt: "2026-07-24T04:30:00.000Z",
  updatedByUserId: "user_fixture",
};

export function createKnowledgeEditorViewFixture(
  overrides: Partial<KnowledgeMemoryEditorViewProps> = {},
): KnowledgeMemoryEditorViewProps {
  const savedKnowledgeMemory =
    overrides.savedKnowledgeMemory === undefined
      ? knowledgeMemoryFixture
      : overrides.savedKnowledgeMemory;
  const content = overrides.content ?? savedKnowledgeMemory?.content ?? "";

  return {
    content,
    onContentChange: () => undefined,
    summary: "",
    onSummaryChange: () => undefined,
    savedKnowledgeMemory,
    characterCount: content.length,
    characterLimit: KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH,
    isOverLimit: content.length > KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH,
    hasChanges: false,
    canSave: false,
    canUpdateKnowledgeMemory: true,
    isLoading: false,
    isSaving: false,
    onOpenHistory: () => undefined,
    onSubmit: async () => undefined,
    ...overrides,
  };
}
