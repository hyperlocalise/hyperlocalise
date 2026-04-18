import type { LlmProvider } from "@/lib/database/types";

const validationPrompt = "ping";

function createValidationError(message: string) {
  const error = new Error(message);
  error.name = "ProviderCredentialValidationError";
  return error;
}

async function parseProviderError(response: Response) {
  const bodyText = await response.text();

  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { message?: string } | string;
      message?: string;
    };

    if (typeof parsed.error === "string") {
      return parsed.error;
    }

    if (parsed.error && typeof parsed.error === "object" && parsed.error.message) {
      return parsed.error.message;
    }

    if (parsed.message) {
      return parsed.message;
    }
  } catch {}

  return bodyText.trim() || `provider request failed with status ${response.status}`;
}

async function validateOpenAiCompatibleProvider(input: {
  apiKey: string;
  model: string;
  provider: "openai" | "gemini" | "groq" | "mistral";
}) {
  const baseUrlByProvider = {
    openai: "https://api.openai.com/v1/chat/completions",
    gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    groq: "https://api.groq.com/openai/v1/chat/completions",
    mistral: "https://api.mistral.ai/v1/chat/completions",
  } as const;

  const response = await fetch(baseUrlByProvider[input.provider], {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      messages: [{ role: "user", content: validationPrompt }],
      max_tokens: 1,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw createValidationError(await parseProviderError(response));
  }
}

async function validateAnthropicProvider(input: { apiKey: string; model: string }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 1,
      messages: [{ role: "user", content: validationPrompt }],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw createValidationError(await parseProviderError(response));
  }
}

export async function validateProviderCredential(input: {
  provider: LlmProvider;
  apiKey: string;
  model: string;
}) {
  switch (input.provider) {
    case "anthropic":
      return validateAnthropicProvider(input);
    case "gemini":
    case "groq":
    case "mistral":
    case "openai":
      return validateOpenAiCompatibleProvider({
        provider: input.provider,
        apiKey: input.apiKey,
        model: input.model,
      });
  }
}
