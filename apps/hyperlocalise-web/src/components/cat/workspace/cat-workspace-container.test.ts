import { describe, expect, it } from "vite-plus/test";

// mergeCatWorkspaceState was replaced by CatWorkspaceStore.hydrateFromServerSnapshot.
// See cat-workspace-store.test.ts for hydration parity coverage.

describe("cat-workspace-container exports", () => {
  it("keeps the container module loadable after the MobX migration", async () => {
    const module = await import("./cat-workspace-container");
    expect(module.CatWorkspaceContainer).toBeTypeOf("function");
  });
});
