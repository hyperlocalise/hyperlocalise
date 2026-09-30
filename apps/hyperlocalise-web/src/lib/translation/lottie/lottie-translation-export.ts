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
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { inferSupportedTranslationFileFormat } from "@/lib/translation/file-formats";

import { applyDotLottieTextTranslations } from "./dotlottie-archive";
import { applyLottieTextTranslations, isLottieTextKey, parseLottieJson } from "./lottie-document";

export const DOTLOTTIE_CONTENT_TYPE = "application/zip+dotlottie";
export const LOTTIE_JSON_CONTENT_TYPE = "application/json; charset=utf-8";

export type LottieSourceKind = "json" | "dotlottie";

export type LottieTranslationExportError =
  | { code: "source_not_lottie" }
  | { code: "invalid_dotlottie_archive" };

export type LottieTranslationExport = {
  kind: LottieSourceKind;
  content: Buffer;
  contentType: string;
};

/**
 * Detects Lottie sources from the translation keys the CLI extracted, so plain JSON
 * catalogs never pay for loading the stored source file.
 */
export function resolveLottieSourceKind(
  sourcePath: string,
  keys: readonly string[],
): LottieSourceKind | null {
  const format = inferSupportedTranslationFileFormat(sourcePath);
  if (format === "lottie") {
    return "dotlottie";
  }
  if (format === "json" && keys.length > 0 && keys.every(isLottieTextKey)) {
    return "json";
  }
  return null;
}

export async function buildLottieTranslationExport(input: {
  kind: LottieSourceKind;
  sourceContent: Buffer;
  values: Readonly<Record<string, string>>;
}): Promise<Result<LottieTranslationExport, LottieTranslationExportError>> {
  if (input.kind === "dotlottie") {
    const archive = await applyDotLottieTextTranslations(input.sourceContent, input.values);
    if (isErr(archive)) {
      return err({ code: "invalid_dotlottie_archive" });
    }
    return ok({
      kind: "dotlottie",
      content: Buffer.from(archive.value),
      contentType: DOTLOTTIE_CONTENT_TYPE,
    });
  }

  const payload = parseLottieJson(input.sourceContent.toString("utf8"));
  if (!payload) {
    return err({ code: "source_not_lottie" });
  }
  return ok({
    kind: "json",
    content: Buffer.from(
      JSON.stringify(applyLottieTextTranslations(payload, input.values)),
      "utf8",
    ),
    contentType: LOTTIE_JSON_CONTENT_TYPE,
  });
}
