import { openai } from "@ai-sdk/openai";
import { generateText, Output, type LanguageModel } from "ai";
import type { Message, Thread } from "chat";
import { z } from "zod";

import {
  getImageAttachments,
  localizeImageAttachment,
  type ImageLocalizationAttachment,
} from "@/lib/agents/image-localization";
import { hyperlocaliseAgentModelId } from "@/lib/agent-runtime/loops/model";
import { env } from "@/lib/env";

import {
  createStoredSlackImageAttachment,
  getSlackImageSourcesForFollowUp,
  storeSlackImageOutput,
  storeSlackImageSource,
  threadHasStoredSlackImages,
  updateSlackImageThreadState,
} from "./image-session";
import type { SlackBotThreadState } from "./repository-session";

type SlackImageThread = Thread<SlackBotThreadState>;
type SlackImageIntentMessage = {
  role: "user" | "assistant";
  content: string;
};

const slackImageRequestIntentSchema = z.object({
  targetLocale: z.string().trim().nullable(),
  instructions: z.string().trim().nullable(),
  confidence: z.number().min(0).max(1),
  missingFields: z.array(z.enum(["targetLocale"])),
});

export type SlackImageRequestIntent = z.infer<typeof slackImageRequestIntentSchema>;

type CreateSlackImageRequestInterpreterOptions = {
  model: LanguageModel;
};

type InterpretSlackImageRequestInput = {
  text: string;
  messages?: SlackImageIntentMessage[];
};

type SlackImageStorageContext = {
  organizationId: string;
  projectId: string | null;
  createdByUserId: string | null;
  interactionId: string;
};

function getSlackImageIntentModel() {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return openai(hyperlocaliseAgentModelId);
}

function normalizeLocale(locale: string) {
  const value = locale.trim().replaceAll("_", "-");
  try {
    return new Intl.Locale(value).toString();
  } catch {
    return value.toLowerCase();
  }
}

function normalizeInstructions(instructions: string | null) {
  const value = instructions?.trim();
  return value ? value : null;
}

function normalizeSlackImageRequestIntent(
  intent: SlackImageRequestIntent,
): SlackImageRequestIntent {
  const targetLocale = intent.targetLocale ? normalizeLocale(intent.targetLocale) : null;
  const missingFields = new Set(intent.missingFields);

  if (targetLocale) {
    missingFields.delete("targetLocale");
  } else {
    missingFields.add("targetLocale");
  }

  return {
    targetLocale,
    instructions: normalizeInstructions(intent.instructions),
    confidence: intent.confidence,
    missingFields: [...missingFields] as SlackImageRequestIntent["missingFields"],
  };
}

function buildSlackImageRequestPrompt(input: InterpretSlackImageRequestInput) {
  const history = input.messages
    ?.slice(-12)
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n");

  return [
    "Extract the target locale and actionable localization instructions from this Slack image request.",
    "Return the target locale as a BCP 47 locale tag when present.",
    "Infer common language names and regions, such as Japanese to ja, Vietnamese to vi, Brazilian Portuguese to pt-BR, French Canada to fr-CA, and Simplified Chinese to zh-CN.",
    "If the user mentions exactly one language in an image-localization request, treat it as the target locale unless they explicitly say it is the source.",
    "If the current message omits the target locale, use recent conversation only when it clearly establishes the active target locale.",
    "Do not guess from the Slack workspace, user profile, attachment filename, or unrelated conversation.",
    "Put tone, audience, copy, layout, or style preferences in instructions.",
    "Do not include attachment handling, greetings, or unrelated chat text in instructions.",
    "",
    "Recent conversation:",
    history || "(none)",
    "",
    "Current Slack message:",
    input.text || "(none)",
  ].join("\n");
}

export function createSlackImageRequestInterpreter({
  model,
}: CreateSlackImageRequestInterpreterOptions) {
  return async (input: InterpretSlackImageRequestInput) => {
    const { output } = await generateText({
      model,
      output: Output.object({
        schema: slackImageRequestIntentSchema,
      }),
      system:
        "You are a precise Slack intake parser for an image localization agent. Return only structured data.",
      prompt: buildSlackImageRequestPrompt(input),
      temperature: 0,
    });

    return normalizeSlackImageRequestIntent(output);
  };
}

export async function interpretSlackImageRequest(input: InterpretSlackImageRequestInput) {
  const interpret = createSlackImageRequestInterpreter({
    model: getSlackImageIntentModel(),
  });

  return interpret(input);
}

export function getSlackImageAttachments(message: Message): ImageLocalizationAttachment[] {
  return getImageAttachments(message);
}

function buildMissingTargetLocaleMessage() {
  return [
    "I received your image, but I need the target language before I can localize it.",
    "",
    "Reply in this thread with the target language, for example: `Localize to Japanese`.",
    "You do not need to upload the image again.",
  ].join("\n");
}

function buildImageFailureMessage(imageName: string | undefined) {
  return `Sorry, I couldn't localize ${imageName ?? "that image"} right now. Please try again with the image and target language.`;
}

function buildLocalizedImageReplyMessage(imageName: string | undefined, targetLocale: string) {
  return [
    `Here is the localized version of ${imageName ?? "your image"} for ${targetLocale}. I kept the layout and style as close to the original as possible.`,
    "",
    "Tell me if you'd like any adjustments to the text placement or tone, or ask for another target language without reuploading the image.",
  ].join("\n");
}

export type HandleSlackImageAttachmentsOptions = {
  imageAttachments?: ImageLocalizationAttachment[];
  conversationMessages?: SlackImageIntentMessage[];
  threadState?: SlackBotThreadState | null;
  storage?: SlackImageStorageContext;
  beforePostGeneratedImage?: () => Promise<void> | void;
};

type LocalizeSlackImageSourceInput = {
  thread: SlackImageThread;
  message: Message;
  source: { sourceFileId: string; filename: string; contentType: string };
  targetLocale: string;
  instructions: string | null;
  threadState: SlackBotThreadState | null;
  storage: SlackImageStorageContext;
  beforePostGeneratedImage?: () => Promise<void> | void;
};

async function localizeSlackImageSource(input: LocalizeSlackImageSourceInput) {
  const attachment = await createStoredSlackImageAttachment({
    organizationId: input.storage.organizationId,
    projectId: input.storage.projectId,
    sourceFileId: input.source.sourceFileId,
    filename: input.source.filename,
    contentType: input.source.contentType,
  });

  const file = await localizeImageAttachment({
    attachment,
    targetLocale: input.targetLocale,
    instructions: input.instructions,
    contextLines: [input.message.text ? `Slack request: ${input.message.text}` : null],
  });

  const storedOutput = await storeSlackImageOutput({
    organizationId: input.storage.organizationId,
    projectId: input.storage.projectId,
    createdByUserId: input.storage.createdByUserId,
    interactionId: input.storage.interactionId,
    sourceFileId: input.source.sourceFileId,
    filename: file.filename,
    contentType: file.mimeType,
    content: file.data,
    targetLocale: input.targetLocale,
    instructions: input.instructions,
  });

  if (input.beforePostGeneratedImage) {
    try {
      await input.beforePostGeneratedImage();
    } catch (error) {
      console.error("Failed to run Slack pre-image-post hook", {
        error,
        imageName: input.source.filename,
        targetLocale: input.targetLocale,
      });
    }
  }

  await input.thread.post({
    raw: buildLocalizedImageReplyMessage(input.source.filename, input.targetLocale),
    files: [
      {
        data: file.data,
        filename: file.filename,
        mimeType: file.mimeType,
      },
    ],
  });

  await updateSlackImageThreadState(input.thread, input.threadState, {
    pendingSlackImageTask: null,
    newSources: [input.source],
    localizedOutput: {
      sourceFileId: input.source.sourceFileId,
      output: {
        fileId: storedOutput.fileId,
        filename: storedOutput.filename,
        contentType: storedOutput.contentType,
        targetLocale: input.targetLocale,
        instructions: input.instructions,
        createdAt: new Date().toISOString(),
      },
    },
  });

  return true;
}

async function localizeSlackImageSources(input: {
  thread: SlackImageThread;
  message: Message;
  sources: Array<{ sourceFileId: string; filename: string; contentType: string }>;
  targetLocale: string;
  instructions: string | null;
  threadState: SlackBotThreadState | null;
  storage: SlackImageStorageContext;
  beforePostGeneratedImage?: () => Promise<void> | void;
}) {
  let localizedCount = 0;
  let threadState = input.threadState;

  for (const source of input.sources) {
    try {
      await localizeSlackImageSource({
        thread: input.thread,
        message: input.message,
        source,
        targetLocale: input.targetLocale,
        instructions: input.instructions,
        threadState,
        storage: input.storage,
        beforePostGeneratedImage: input.beforePostGeneratedImage,
      });
      localizedCount += 1;
      threadState = (await input.thread.state) as SlackBotThreadState | null;
    } catch (error) {
      console.error("Failed to localize Slack image attachment", {
        error,
        imageName: source.filename,
        targetLocale: input.targetLocale,
      });
      await input.thread.post(buildImageFailureMessage(source.filename));
    }
  }

  return localizedCount;
}

export async function handleSlackImageAttachments(
  thread: SlackImageThread,
  message: Message,
  options: HandleSlackImageAttachmentsOptions = {},
) {
  const imageAttachments = options.imageAttachments ?? getSlackImageAttachments(message);
  const conversationMessages = options.conversationMessages ?? [];
  if (imageAttachments.length === 0) {
    return { handled: false, localizedCount: 0 };
  }

  const intent = await interpretSlackImageRequest({
    text: message.text,
    messages: conversationMessages,
  });
  const targetLocale = intent.targetLocale;
  const threadState = options.threadState ?? null;
  const storage = options.storage;

  const storedSources = storage
    ? await Promise.all(
        imageAttachments.map(async (imageAttachment, index) =>
          storeSlackImageSource({
            attachment: imageAttachment,
            index,
            organizationId: storage.organizationId,
            projectId: storage.projectId,
            createdByUserId: storage.createdByUserId,
            interactionId: storage.interactionId,
          }),
        ),
      )
    : imageAttachments.map((imageAttachment, index) => ({
        sourceFileId: `ephemeral-${index}`,
        filename: imageAttachment.name ?? `slack-image-${index + 1}.png`,
        contentType: imageAttachment.mimeType ?? "image/png",
      }));

  if (!targetLocale) {
    if (storage) {
      await updateSlackImageThreadState(thread, threadState, {
        pendingSlackImageTask: { sourceAssets: storedSources },
        newSources: storedSources,
      });
    }

    await thread.post(buildMissingTargetLocaleMessage());
    return { handled: true, localizedCount: 0, missingTargetLocale: true };
  }

  if (!storage) {
    let localizedCount = 0;
    for (const imageAttachment of imageAttachments) {
      try {
        const file = await localizeImageAttachment({
          attachment: imageAttachment,
          targetLocale,
          instructions: intent.instructions,
          contextLines: [message.text ? `Slack request: ${message.text}` : null],
        });

        if (options.beforePostGeneratedImage) {
          try {
            await options.beforePostGeneratedImage();
          } catch (error) {
            console.error("Failed to run Slack pre-image-post hook", {
              error,
              imageName: imageAttachment.name,
              targetLocale,
            });
          }
        }

        await thread.post({
          raw: buildLocalizedImageReplyMessage(imageAttachment.name, targetLocale),
          files: [
            {
              data: file.data,
              filename: file.filename,
              mimeType: file.mimeType,
            },
          ],
        });
        localizedCount += 1;
      } catch (error) {
        console.error("Failed to localize Slack image attachment", {
          error,
          imageName: imageAttachment.name,
          targetLocale,
        });
        await thread.post(buildImageFailureMessage(imageAttachment.name));
      }
    }

    return { handled: true, localizedCount, targetLocale };
  }

  const localizedCount = await localizeSlackImageSources({
    thread,
    message,
    sources: storedSources,
    targetLocale,
    instructions: intent.instructions,
    threadState,
    storage,
    beforePostGeneratedImage: options.beforePostGeneratedImage,
  });

  return { handled: true, localizedCount, targetLocale };
}

export async function handleSlackImageFollowUp(
  thread: SlackImageThread,
  message: Message,
  options: {
    conversationMessages?: SlackImageIntentMessage[];
    threadState?: SlackBotThreadState | null;
    storage: SlackImageStorageContext;
    beforeLocalize?: () => void;
    beforePostGeneratedImage?: () => Promise<void> | void;
  },
) {
  const threadState = options.threadState ?? null;
  if (!threadHasStoredSlackImages(threadState)) {
    return { handled: false, localizedCount: 0 };
  }

  const intent = await interpretSlackImageRequest({
    text: message.text,
    messages: options.conversationMessages ?? [],
  });

  if (!intent.targetLocale) {
    return { handled: false, localizedCount: 0 };
  }

  const sources = getSlackImageSourcesForFollowUp(threadState);
  if (sources.length === 0) {
    return { handled: false, localizedCount: 0 };
  }

  options.beforeLocalize?.();

  const localizedCount = await localizeSlackImageSources({
    thread,
    message,
    sources,
    targetLocale: intent.targetLocale,
    instructions: intent.instructions,
    threadState,
    storage: options.storage,
    beforePostGeneratedImage: options.beforePostGeneratedImage,
  });

  return { handled: true, localizedCount, targetLocale: intent.targetLocale };
}
