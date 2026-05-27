import { describe, expect, it } from "vite-plus/test";
import { sanitizeReturnTo } from "./return-to";

describe("sanitizeReturnTo", () => {
  it("should return the original value if it is a valid path", () => {
    expect(sanitizeReturnTo("/dashboard")).toBe("/dashboard");
    expect(sanitizeReturnTo("/projects")).toBe("/projects");
    expect(sanitizeReturnTo("/org/abc/settings")).toBe("/org/abc/settings");
  });

  it("should return the fallback if the value is null or undefined", () => {
    expect(sanitizeReturnTo(null)).toBe("/dashboard");
    expect(sanitizeReturnTo(undefined)).toBe("/dashboard");
    expect(sanitizeReturnTo(null, "/custom")).toBe("/custom");
  });

  it("should return the fallback if the value does not start with /", () => {
    expect(sanitizeReturnTo("https://example.com")).toBe("/dashboard");
    expect(sanitizeReturnTo("dashboard")).toBe("/dashboard");
  });

  it("should return the fallback if the value starts with // or /\\", () => {
    expect(sanitizeReturnTo("//example.com")).toBe("/dashboard");
    expect(sanitizeReturnTo("/\\example.com")).toBe("/dashboard");
  });

  it("should return the fallback if the value is a restricted auth path", () => {
    expect(sanitizeReturnTo("/auth/sign-in")).toBe("/dashboard");
    expect(sanitizeReturnTo("/auth/sign-out")).toBe("/dashboard");
    expect(sanitizeReturnTo("/auth/callback")).toBe("/dashboard");
    expect(sanitizeReturnTo("/auth/github/callback")).toBe("/dashboard");
    expect(sanitizeReturnTo("/auth/select-organization")).toBe("/dashboard");
    expect(sanitizeReturnTo("/auth/onboarding")).toBe("/dashboard");
    expect(sanitizeReturnTo("/auth/access-denied")).toBe("/dashboard");
  });

  it("should preserve GitHub install callback URLs that include installation params", () => {
    expect(
      sanitizeReturnTo(
        "/auth/github/callback?installation_id=123456&state=org-slug%3A123%3Anonce%3Asignature",
      ),
    ).toBe("/auth/github/callback?installation_id=123456&state=org-slug%3A123%3Anonce%3Asignature");
  });

  it("should return the fallback if the value starts with a restricted auth path followed by ?, #, or /", () => {
    expect(sanitizeReturnTo("/auth/sign-in?foo=bar")).toBe("/dashboard");
    expect(sanitizeReturnTo("/auth/sign-in#section")).toBe("/dashboard");
    expect(sanitizeReturnTo("/auth/callback/extra")).toBe("/dashboard");
  });

  it("should not return the fallback for paths that just contain the restricted path as a substring", () => {
    expect(sanitizeReturnTo("/not/auth/sign-in")).toBe("/not/auth/sign-in");
    expect(sanitizeReturnTo("/auth/sign-in-not-really")).toBe("/auth/sign-in-not-really");
  });

  it("should detect URL-encoded restricted paths", () => {
    // %73 is 's'
    expect(sanitizeReturnTo("/auth/%73ign-in")).toBe("/dashboard");
    // %2f is '/'
    expect(sanitizeReturnTo("%2fauth/sign-in")).toBe("/dashboard");
  });

  it("should detect mixed-case restricted paths", () => {
    expect(sanitizeReturnTo("/AUTH/SIGN-IN")).toBe("/dashboard");
    expect(sanitizeReturnTo("/Auth/Onboarding")).toBe("/dashboard");
  });

  it("should handle encoded query separators", () => {
    expect(sanitizeReturnTo("/auth/sign-in%3Ffoo=bar")).toBe("/dashboard");
    expect(sanitizeReturnTo("/auth/sign-in%23section")).toBe("/dashboard");
  });
});
