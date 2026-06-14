import { describe, expect, it } from "vite-plus/test";

import type { ProjectFileCatResponse } from "@/api/routes/project/project.schema";
import { mergeCatWorkspaceRows } from "./project-file-cat-workspace";

function catFileWithSegments(
  segments: Array<{ externalStringId: string; text: string | null }>,
): ProjectFileCatResponse["catFile"] {
  return {
    sourcePath: "home.json",
    filename: "home.json",
    provider: null,
    targetLocale: "fr",
    canEditTranslations: true,
    truncated: false,
    segments: segments.map((segment) => ({
      externalStringId: segment.externalStringId,
      key: segment.externalStringId,
      sourceText: "Source",
      context: null,
      type: "text",
      target:
        segment.text == null
          ? null
          : {
              text: segment.text,
              externalTranslationId: null,
              isApproved: false,
            },
      comments: [],
    })),
  } as ProjectFileCatResponse["catFile"];
}

describe("mergeCatWorkspaceRows", () => {
  it("keeps dirty and saving drafts when refreshed CAT data arrives", () => {
    const merged = mergeCatWorkspaceRows(
      catFileWithSegments([
        { externalStringId: "clean", text: "Serveur" },
        { externalStringId: "dirty", text: "Ancienne valeur" },
        { externalStringId: "saving", text: "Ancienne sauvegarde" },
      ]),
      {
        drafts: {
          clean: "Old clean",
          dirty: "Draft in progress",
          saving: "Saving draft",
        },
        saveStates: {
          clean: "unchanged",
          dirty: "dirty",
          saving: "saving",
        },
        rowErrors: {
          dirty: "Still local",
        },
      },
    );

    expect(merged.drafts).toEqual({
      clean: "Serveur",
      dirty: "Draft in progress",
      saving: "Saving draft",
    });
    expect(merged.saveStates).toEqual({
      clean: "unchanged",
      dirty: "dirty",
      saving: "saving",
    });
    expect(merged.rowErrors).toEqual({ dirty: "Still local" });
  });

  it("keeps failed drafts and row errors when refreshed CAT data arrives", () => {
    const merged = mergeCatWorkspaceRows(
      catFileWithSegments([{ externalStringId: "failed", text: "Serveur" }]),
      {
        drafts: {
          failed: "Draft that failed to save",
        },
        saveStates: {
          failed: "failed",
        },
        rowErrors: {
          failed: "Crowdin rejected the update",
        },
      },
    );

    expect(merged.drafts).toEqual({
      failed: "Draft that failed to save",
    });
    expect(merged.saveStates).toEqual({
      failed: "failed",
    });
    expect(merged.rowErrors).toEqual({
      failed: "Crowdin rejected the update",
    });
  });
});
