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
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { http, HttpResponse } from "msw";
import { fn } from "storybook/test";
import { ContentEditorMultilingualTable } from "./content-editor-multilingual-table";

const sourceStrings = [
  "Next run {detail}",
  "Today {time}",
  "Daily",
  "Tomorrow {time}",
  "Failed to update routine",
  "Weekly summary",
];
const translations: Record<string, string[]> = {
  fr: [
    "Prochaine exécution {detail}",
    "Aujourd’hui {time}",
    "Chaque jour",
    "Demain {time}",
    "Impossible de mettre à jour la routine",
    "Résumé hebdomadaire",
  ],
  de: [
    "Nächster Lauf {detail}",
    "Heute {time}",
    "Täglich",
    "Morgen {time}",
    "Routine konnte nicht aktualisiert werden",
    "Wöchentliche Zusammenfassung",
  ],
  ja: [
    "次の実行 {detail}",
    "今日 {time}",
    "毎日",
    "明日 {time}",
    "ルーチンを更新できませんでした",
    "週間のまとめ",
  ],
  ar: [
    "التشغيل التالي {detail}",
    "اليوم {time}",
    "يوميًا",
    "غدًا {time}",
    "تعذر تحديث الروتين",
    "الملخص الأسبوعي",
  ],
  vi: [
    "Lần chạy tiếp theo {detail}",
    "Hôm nay {time}",
    "Hằng ngày",
    "Ngày mai {time}",
    "Không thể cập nhật quy trình",
    "Tóm tắt hằng tuần",
  ],
};
const meta = {
  title: "CAT/Multilingual table",
  component: ContentEditorMultilingualTable,
  parameters: {
    layout: "fullscreen",
    msw: {
      handlers: [
        http.get(
          "*/api/orgs/:org/projects/:project/files/detail/cat/segments/:id/target",
          ({ request, params }) => {
            const locale = new URL(request.url).searchParams.get("targetLocale") ?? "fr";
            const index = Number(String(params.id).replace("key-", ""));
            return HttpResponse.json({
              target:
                index % 17 === 8
                  ? null
                  : {
                      text:
                        translations[locale]?.[index % sourceStrings.length] ??
                        sourceStrings[index % sourceStrings.length],
                      externalTranslationId: null,
                      isApproved: index % 3 === 0,
                    },
            });
          },
        ),
      ],
    },
  },
  decorators: [
    (Story) => (
      <div className="h-dvh bg-background text-foreground">
        <Story />
      </div>
    ),
  ],
  args: {
    config: {
      onSaveTranslation: fn().mockResolvedValue(undefined),
      organizationSlug: "demo",
      projectId: "demo",
      sourcePath: "messages.json",
      sourceLocale: "en",
      targetLocales: ["fr", "de", "ja", "ar", "vi"],
    },
    segments: Array.from({ length: 10_000 }, (_, index) => ({
      id: `key-${index}`,
      key: `schedule.messages.${index}`,
      index: index + 1,
      sourceText: sourceStrings[index % sourceStrings.length],
      targetText: "",
      sourceLocale: "en",
      targetLocale: "fr",
      status: "pending" as const,
    })),
    selectedSegmentId: "key-0",
    onOpenTranslation: fn(),
  },
} satisfies Meta<typeof ContentEditorMultilingualTable>;
export default meta;
type Story = StoryObj<typeof meta>;
export const LargeFile: Story = {};
export const Loading: Story = { args: { isLoading: true } };
export const Empty: Story = { args: { segments: [] } };
