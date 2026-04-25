import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_API_KEY: "test-openai-api-key",
    RESEND_API_KEY: "test-key",
    RESEND_FROM_NAME: "Hyperlocalise",
  },
}));

import {
  getSandboxInputFilename,
  getSandboxOutputFilename,
  getSandboxTranslationEnv,
} from "./email-translation";

describe("email translation workflow filenames", () => {
  it("preserves the attachment extension for sandbox input and output files", () => {
    expect(getSandboxInputFilename("en-US.json")).toBe("en-US.json");
    expect(getSandboxOutputFilename("en-US.json", "vi")).toBe("en-US-vi.json");
  });

  it("keeps extensionless input and output filenames aligned", () => {
    expect(getSandboxInputFilename("README")).toBe("README");
    expect(getSandboxOutputFilename("README", "vi")).toBe("README-vi");
  });

  it("sanitizes unsafe attachment filename characters without dropping the extension", () => {
    expect(getSandboxInputFilename("../en US.json")).toBe(".._en_US.json");
    expect(getSandboxOutputFilename("../en US.json", "vi")).toBe(".._en_US-vi.json");
  });

  it("passes provider credentials to the sandbox translation command", () => {
    expect(getSandboxTranslationEnv()).toEqual({
      OPENAI_API_KEY: "test-openai-api-key",
    });
  });
});
