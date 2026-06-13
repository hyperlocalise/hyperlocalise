import { localizedImageOutputFilename } from "@/lib/agents/image-localization";
import { regenerateImageFromAttachment } from "@/lib/agents/image-generation";

import type { ContentfulManagementClient } from "./client";

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
}) {
  const sourceAsset = await input.client.getAsset(input.assetId);
  const downloaded = await input.client.downloadAssetFile({
    asset: sourceAsset,
    locale: input.sourceLocale,
  });
  const prompt = buildContentfulImageLocalizationPrompt({
    fieldName: input.fieldName,
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
  });
  const localized = await regenerateImageFromAttachment(
    downloaded.buffer,
    downloaded.contentType,
    prompt,
  );
  const localizedFileName = localizedImageOutputFilename(
    downloaded.fileName,
    input.targetLocale,
    localized.mimeType,
  );
  const createdAsset = await input.client.createLocalizedAsset({
    locale: input.targetLocale,
    fileName: localizedFileName,
    contentType: localized.mimeType,
    buffer: localized.image,
    title: sourceAsset.fields.title?.[input.sourceLocale] ?? localizedFileName,
    description: sourceAsset.fields.description?.[input.sourceLocale],
  });

  return {
    sourceAssetId: input.assetId,
    localizedAssetId: createdAsset.sys.id,
    fileName: localizedFileName,
  };
}
