import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { providerSafeFetch } from "@/lib/providers/provider-safe-fetch";
import { validateProviderCredential } from "@/lib/providers/validation";

vi.mock("@/lib/providers/provider-safe-fetch", () => ({
  providerSafeFetch: vi.fn(),
}));

function mockSuccessfulProviderResponse() {
  vi.mocked(providerSafeFetch).mockResolvedValueOnce(new Response(null, { status: 200 }));
}

function getLastProviderFetchInit() {
  const call = vi.mocked(providerSafeFetch).mock.calls.at(-1);
  if (!call) {
    throw new Error("providerSafeFetch was not called");
  }

  return call[1] as RequestInit;
}

describe("validateProviderCredential", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  for (const testCase of [
    {
      provider: "openai",
      url: "https://api.openai.com/v1/chat/completions",
    },
    {
      provider: "gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    },
    {
      provider: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
    },
    {
      provider: "mistral",
      url: "https://api.mistral.ai/v1/chat/completions",
    },
  ] as const) {
    it(`validates ${testCase.provider} credentials through the safe provider fetch path`, async () => {
      mockSuccessfulProviderResponse();

      await validateProviderCredential({
        provider: testCase.provider,
        apiKey: "test-api-key",
        model: `${testCase.provider}-model`,
      });

      expect(providerSafeFetch).toHaveBeenCalledWith(
        testCase.url,
        expect.objectContaining({
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer test-api-key",
          },
        }),
      );

      const init = getLastProviderFetchInit();
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.parse(String(init.body))).toEqual({
        model: `${testCase.provider}-model`,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      });
    });
  }

  it("validates Anthropic credentials with Anthropic-specific headers", async () => {
    mockSuccessfulProviderResponse();

    await validateProviderCredential({
      provider: "anthropic",
      apiKey: "anthropic-api-key",
      model: "claude-test",
    });

    expect(providerSafeFetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": "anthropic-api-key",
          "anthropic-version": "2023-06-01",
        },
      }),
    );

    const init = getLastProviderFetchInit();
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toEqual({
      model: "claude-test",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
  });

  it("throws a stable validation error with a provider JSON error message", async () => {
    vi.mocked(providerSafeFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "invalid api key" } }), { status: 401 }),
    );

    await expect(
      validateProviderCredential({
        provider: "openai",
        apiKey: "bad-api-key",
        model: "gpt-test",
      }),
    ).rejects.toMatchObject({
      name: "ProviderCredentialValidationError",
      message: "invalid api key",
    });
  });

  it("falls back to the provider response text when error JSON is unavailable", async () => {
    vi.mocked(providerSafeFetch).mockResolvedValueOnce(
      new Response("rate limited", { status: 429 }),
    );

    await expect(
      validateProviderCredential({
        provider: "anthropic",
        apiKey: "rate-limited-key",
        model: "claude-test",
      }),
    ).rejects.toMatchObject({
      name: "ProviderCredentialValidationError",
      message: "rate limited",
    });
  });
});
