import { openai } from "@ai-sdk/openai";
import { generateText, Output, type LanguageModel } from "ai";
import type { Message, Thread } from "chat";
import { z } from "zod";

import {
  getImageAttachments,
  localizeImageAttachment,
  type ImageLocalizationAttachment,
} from "@/lib/agents/image-localization";
import { env } from "@/lib/env";

type SlackImageThread = Thread<Record<string, unknown>>;
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

function getSlackImageIntentModel() {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return openai("gpt-5.4-mini");
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
    "Please resend the image with a target language, for example: `Localize this image to Japanese`.",
  ].join("\n");
}

function buildImageFailureMessage(imageAttachment: ImageLocalizationAttachment) {
  return `Sorry, I couldn't localize ${imageAttachment.name ?? "that image"} right now. Please try again with the image and target language.`;
}

type HandleSlackImageAttachmentsOptions = {
  imageAttachments?: ImageLocalizationAttachment[];
  conversationMessages?: SlackImageIntentMessage[];
  beforePostGeneratedImage?: () => Promise<void> | void;
};

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

  if (!targetLocale) {
    await thread.post(buildMissingTargetLocaleMessage());
    return { handled: true, localizedCount: 0, missingTargetLocale: true };
  }

  let localizedCount = 0;
  for (const imageAttachment of imageAttachments) {
    try {
      const file = await localizeImageAttachment({
        attachment: imageAttachment,
        targetLocale,
        instructions: intent.instructions,
        contextLines: [message.text ? `Slack request: ${message.text}` : null],
      });

      await options.beforePostGeneratedImage?.();
      await thread.post({
        raw: [
          `Here is the localized version of ${imageAttachment.name ?? "your image"} for ${targetLocale}. I kept the layout and style as close to the original as possible.`,
          "",
          "Tell me if you'd like any adjustments to the text placement or tone.",
        ].join("\n"),
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
      await thread.post(buildImageFailureMessage(imageAttachment));
    }
  }

  return { handled: true, localizedCount, targetLocale };
}
