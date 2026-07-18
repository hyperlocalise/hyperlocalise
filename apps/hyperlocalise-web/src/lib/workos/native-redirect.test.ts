import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_NATIVE_REDIRECT_URI,
  getAllowedNativeRedirectUris,
  isAllowedNativeRedirectUri,
} from "./native-redirect";

describe("native-redirect", () => {
  it("always allows the default custom scheme", () => {
    expect(DEFAULT_NATIVE_REDIRECT_URI).toBe("hyperlocalise://auth/callback");
    expect(getAllowedNativeRedirectUris()).toContain("hyperlocalise://auth/callback");
    expect(isAllowedNativeRedirectUri("hyperlocalise://auth/callback")).toBe(true);
    expect(isAllowedNativeRedirectUri("https://evil.example/callback")).toBe(false);
    expect(isAllowedNativeRedirectUri("")).toBe(false);
  });
});
