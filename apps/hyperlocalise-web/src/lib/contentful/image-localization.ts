import { localizedImageOutputFilename } from "@/lib/agents/image-localization";
import { regenerateImageFromAttachment } from "@/lib/agents/image-generation";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import type { ContentfulClientError, ContentfulManagementClient } from "./client";

function buildContentfulImageLocalizationPrompt(input: {
  fieldName: string;
  sourceLocale: string;
  targetLocale: string;
}) {
  return [
    "Use the attached image as the visual source and generate a localized version.",
    "Preserve the original layout, style, composition, brand treatment, and visual hierarchy unless the user explicitly asks for a change.",
    `Source locale: ${input.sourceLocale}`,
    `Target locale: ${input.targetLocale}`,
    `Contentful field: ${input.fieldName}`,
    "Only change visible text that should be localized for the target language.",
  ].join("\n");
}

export async function localizeContentfulAssetForLocale(input: {
  client: ContentfulManagementClient;
  assetId: string;
  sourceLocale: string;
  targetLocale: string;
  fieldName: string;
}): Promise<
  Result<
    {
      sourceAssetId: string;
      localizedAssetId: string;
      fileName: string;
    },
    ContentfulClientError
  >
> {
  const sourceAssetResult = await input.client.getAsset(input.assetId);
  if (isErr(sourceAssetResult)) {
    return err(sourceAssetResult.error);
  }

  const targetLocaleFile = sourceAssetResult.value.fields.file?.[input.targetLocale];
  if (targetLocaleFile?.url) {
    return ok({
      sourceAssetId: input.assetId,
      localizedAssetId: input.assetId,
      fileName: targetLocaleFile.fileName,
    });
  }

  const downloadedResult = await input.client.downloadAssetFile({
    asset: sourceAssetResult.value,
    locale: input.sourceLocale,
  });
  if (isErr(downloadedResult)) {
    return err(downloadedResult.error);
  }
  const prompt = buildContentfulImageLocalizationPrompt({
    fieldName: input.fieldName,
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
  });
  const localized = await regenerateImageFromAttachment(
    downloadedResult.value.buffer,
    downloadedResult.value.contentType,
    prompt,
  );
  const localizedFileName = localizedImageOutputFilename(
    downloadedResult.value.fileName,
    input.targetLocale,
    localized.mimeType,
  );
  const updatedAssetResult = await input.client.updateAssetLocaleFile({
    asset: sourceAssetResult.value,
    locale: input.targetLocale,
    fileName: localizedFileName,
    contentType: localized.mimeType,
    buffer: localized.image,
    title: sourceAssetResult.value.fields.title?.[input.sourceLocale] ?? localizedFileName,
    description: sourceAssetResult.value.fields.description?.[input.sourceLocale],
  });
  if (isErr(updatedAssetResult)) {
    return err(updatedAssetResult.error);
  }

  return ok({
    sourceAssetId: input.assetId,
    localizedAssetId: updatedAssetResult.value.sys.id,
    fileName: localizedFileName,
  });
}
