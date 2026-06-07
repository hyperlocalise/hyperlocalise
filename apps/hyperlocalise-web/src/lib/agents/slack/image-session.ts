import type { Thread } from "chat";

import {
  getImageAttachmentData,
  type ImageLocalizationAttachment,
} from "@/lib/agents/image-localization";
import { createStoredFile, getStoredFileContent } from "@/lib/file-storage/records";

import type {
  PendingSlackImageTask,
  SlackBotThreadState,
  SlackImageLocalizationOutput,
  SlackImageSourceAsset,
} from "./repository-session";

type StoreSlackImageSourceInput = {
  attachment: ImageLocalizationAttachment;
  index: number;
  organizationId: string;
  projectId: string | null;
  createdByUserId: string | null;
  interactionId: string;
};

type StoreSlackImageOutputInput = {
  organizationId: string;
  projectId: string | null;
  createdByUserId: string | null;
  interactionId: string;
  sourceFileId: string;
  filename: string;
  contentType: string;
  content: Buffer;
  targetLocale: string;
  instructions: string | null;
};

function attachmentFilename(attachment: ImageLocalizationAttachment, index: number) {
  return attachment.name?.trim() || `slack-image-${index + 1}.png`;
}

function attachmentContentType(attachment: ImageLocalizationAttachment) {
  return attachment.mimeType?.trim() || "image/png";
}

export async function storeSlackImageSource(input: StoreSlackImageSourceInput) {
  const content = await getImageAttachmentData(input.attachment);
  const filename = attachmentFilename(input.attachment, input.index);

  const file = await createStoredFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    createdByUserId: input.createdByUserId,
    role: "source",
    sourceKind: "chat_upload",
    sourceInteractionId: input.interactionId,
    filename,
    contentType: attachmentContentType(input.attachment),
    content,
    metadata: {
      uploadSurface: "slack_agent",
      imageLocalizationSource: true,
      slackAttachmentType: input.attachment.type,
    },
  });

  return {
    sourceFileId: file.id,
    filename: file.filename,
    contentType: file.contentType,
  };
}

export async function storeSlackImageOutput(input: StoreSlackImageOutputInput) {
  const file = await createStoredFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    createdByUserId: input.createdByUserId,
    role: "output",
    sourceKind: "chat_upload",
    sourceInteractionId: input.interactionId,
    filename: input.filename,
    contentType: input.contentType,
    content: input.content,
    metadata: {
      uploadSurface: "slack_agent",
      imageLocalizationOutput: true,
      sourceFileId: input.sourceFileId,
      targetLocale: input.targetLocale,
      instructions: input.instructions,
    },
  });

  return {
    fileId: file.id,
    filename: file.filename,
    contentType: file.contentType,
  };
}

export async function createStoredSlackImageAttachment(input: {
  organizationId: string;
  projectId: string | null;
  sourceFileId: string;
  filename: string;
  contentType: string;
}): Promise<ImageLocalizationAttachment> {
  const { content } = await getStoredFileContent({
    organizationId: input.organizationId,
    projectId: input.projectId,
    fileId: input.sourceFileId,
  });

  return {
    type: "image",
    name: input.filename,
    mimeType: input.contentType,
    fetchData: async () => content,
  } as ImageLocalizationAttachment;
}

function upsertImageSourceAsset(
  assets: SlackImageSourceAsset[],
  source: { sourceFileId: string; filename: string; contentType: string },
) {
  const existing = assets.find((asset) => asset.sourceFileId === source.sourceFileId);
  if (existing) {
    return assets;
  }

  return [
    ...assets,
    {
      sourceFileId: source.sourceFileId,
      filename: source.filename,
      contentType: source.contentType,
      localizedOutputs: [],
    },
  ];
}

export function recordSlackImageLocalizationOutput(input: {
  assets: SlackImageSourceAsset[];
  sourceFileId: string;
  output: SlackImageLocalizationOutput;
}) {
  return input.assets.map((asset) => {
    if (asset.sourceFileId !== input.sourceFileId) {
      return asset;
    }

    const localizedOutputs = asset.localizedOutputs.filter(
      (existing) => existing.targetLocale !== input.output.targetLocale,
    );

    return {
      ...asset,
      localizedOutputs: [...localizedOutputs, input.output],
    };
  });
}

export async function updateSlackImageThreadState(
  thread: Thread<SlackBotThreadState>,
  currentState: SlackBotThreadState | null,
  update: {
    pendingSlackImageTask?: PendingSlackImageTask | null;
    newSources?: Array<{ sourceFileId: string; filename: string; contentType: string }>;
    localizedOutput?: {
      sourceFileId: string;
      output: SlackImageLocalizationOutput;
    };
  },
) {
  let imageSourceAssets = currentState?.imageSourceAssets ?? [];

  if (update.newSources) {
    for (const source of update.newSources) {
      imageSourceAssets = upsertImageSourceAsset(imageSourceAssets, source);
    }
  }

  if (update.localizedOutput) {
    imageSourceAssets = recordSlackImageLocalizationOutput({
      assets: imageSourceAssets,
      sourceFileId: update.localizedOutput.sourceFileId,
      output: update.localizedOutput.output,
    });
  }

  await thread.setState({
    ...currentState,
    imageSourceAssets,
    pendingSlackImageTask:
      update.pendingSlackImageTask === null
        ? undefined
        : (update.pendingSlackImageTask ?? currentState?.pendingSlackImageTask),
  });
}

export function getSlackImageSourcesForFollowUp(state: SlackBotThreadState | null) {
  if (state?.pendingSlackImageTask?.sourceAssets.length) {
    return state.pendingSlackImageTask.sourceAssets;
  }

  const assets = state?.imageSourceAssets ?? [];
  if (assets.length === 0) {
    return [];
  }

  const latestAsset = assets.at(-1);
  return latestAsset
    ? [
        {
          sourceFileId: latestAsset.sourceFileId,
          filename: latestAsset.filename,
          contentType: latestAsset.contentType,
        },
      ]
    : [];
}

export function threadHasStoredSlackImages(state: SlackBotThreadState | null) {
  return (
    Boolean(state?.pendingSlackImageTask?.sourceAssets.length) ||
    Boolean(state?.imageSourceAssets?.length)
  );
}
