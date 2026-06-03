import { describe, expect, it } from "vite-plus/test";

import { isSafeRepositoryRelativePath } from "./safe-repository-path";

describe("isSafeRepositoryRelativePath", () => {
  it("accepts normal localization paths", () => {
    expect(isSafeRepositoryRelativePath("locales/en/messages.json")).toBe(true);
  });

  it("rejects traversal and git paths", () => {
    expect(isSafeRepositoryRelativePath("../secrets.json")).toBe(false);
    expect(isSafeRepositoryRelativePath(".git/config")).toBe(false);
    expect(isSafeRepositoryRelativePath("/etc/passwd")).toBe(false);
  });
});
