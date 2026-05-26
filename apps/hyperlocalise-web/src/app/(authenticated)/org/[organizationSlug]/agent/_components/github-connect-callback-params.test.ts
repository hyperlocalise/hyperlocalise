import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  isGithubConnectedCallback,
  resetGithubConnectCallbackParamsForTests,
  resolveGithubConnectErrorCode,
  shouldShowGithubConnectErrorToast,
} from "./github-connect-callback-params";

describe("github connect callback params", () => {
  afterEach(() => {
    resetGithubConnectCallbackParamsForTests();
  });

  it("caches error codes after search params are cleared", () => {
    expect(resolveGithubConnectErrorCode(new URLSearchParams("error=invalid_state"))).toBe(
      "invalid_state",
    );
    expect(resolveGithubConnectErrorCode(new URLSearchParams())).toBe("invalid_state");
  });

  it("caches github_connected after search params are cleared", () => {
    expect(isGithubConnectedCallback(new URLSearchParams("github_connected=1"))).toBe(true);
    expect(isGithubConnectedCallback(new URLSearchParams())).toBe(true);
  });

  it("dedupes connect error toasts per organization and error code", () => {
    expect(shouldShowGithubConnectErrorToast("acme", "invalid_state")).toBe(true);
    expect(shouldShowGithubConnectErrorToast("acme", "invalid_state")).toBe(false);
    expect(shouldShowGithubConnectErrorToast("other", "invalid_state")).toBe(true);
  });
});
