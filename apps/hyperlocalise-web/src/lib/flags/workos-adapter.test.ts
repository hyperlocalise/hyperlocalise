import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ReadonlyRequestCookies } from "flags";
import type { IntlShape } from "react-intl";

import { buildGlobalNavigationGroups } from "@/components/app-shell/navigation-config";
import {
  WORKSPACE_AUTOMATIONS_FLAG,
  WORKSPACE_KNOWLEDGE_FLAG,
} from "@/lib/flags/workos-flag-entities";
import { filterNavigationByWorkspaceFlags } from "@/lib/flags/workspace-flags";
import { getIntlShape } from "@/lib/app-i18n/intl";

const isEnabled = vi.fn();
const waitUntilReady = vi.fn().mockResolvedValue(undefined);

vi.mock("@workos-inc/authkit-nextjs", () => ({
  getFeatureFlagsRuntimeClient: () => ({
    isEnabled,
    waitUntilReady,
  }),
}));

vi.mock("@/lib/workos/config", () => ({
  getWorkosAuthKitConfig: () => ({
    apiKey: "sk_test",
    clientId: "client_test",
    redirectUri: "http://localhost:3000/auth/callback",
    cookiePassword: "test-workos-cookie-password-at-least-32-chars",
  }),
}));

describe("workosAdapter", () => {
  beforeEach(() => {
    vi.resetModules();
    isEnabled.mockReset();
    waitUntilReady.mockClear();
    waitUntilReady.mockResolvedValue(undefined);
  });

  function createMockCookies(): ReadonlyRequestCookies {
    return {
      get: () => undefined,
      getAll: () => [],
      has: () => false,
      size: 0,
      [Symbol.iterator]: () => [][Symbol.iterator](),
    } as unknown as ReadonlyRequestCookies;
  }
  it("passes organization and user ids to the WorkOS runtime client", async () => {
    isEnabled.mockResolvedValue(true);

    const { createWorkosAdapter } = await import("./workos-adapter");
    const adapter = createWorkosAdapter()();
    const enabled = await adapter.decide({
      key: WORKSPACE_AUTOMATIONS_FLAG,
      entities: {
        user: { id: "user_123" },
        organization: { id: "org_456" },
      },
      headers: new Headers(),
      cookies: createMockCookies(),
    });

    expect(enabled).toBe(true);
    expect(waitUntilReady).toHaveBeenCalledTimes(1);
    expect(waitUntilReady).toHaveBeenCalledWith({ timeoutMs: 2_000 });
    expect(isEnabled).toHaveBeenCalledWith(WORKSPACE_AUTOMATIONS_FLAG, {
      organizationId: "org_456",
      userId: "user_123",
    });
  });

  it("waits for feature flag readiness only once per process", async () => {
    isEnabled.mockResolvedValue(false);

    const { createWorkosAdapter } = await import("./workos-adapter");
    const adapter = createWorkosAdapter()();
    const decideArgs = {
      key: WORKSPACE_AUTOMATIONS_FLAG,
      entities: {
        user: { id: "user_123" },
        organization: { id: "org_456" },
      },
      headers: new Headers(),
      cookies: createMockCookies(),
    };

    await adapter.decide(decideArgs);
    await adapter.decide({ ...decideArgs, key: WORKSPACE_KNOWLEDGE_FLAG });

    expect(waitUntilReady).toHaveBeenCalledTimes(1);
    expect(isEnabled).toHaveBeenCalledTimes(2);
  });

  it("returns false when isEnabled rejects", async () => {
    isEnabled.mockRejectedValue(new Error("WorkOS API error"));

    const { createWorkosAdapter } = await import("./workos-adapter");
    const adapter = createWorkosAdapter()();
    const enabled = await adapter.decide({
      key: WORKSPACE_AUTOMATIONS_FLAG,
      entities: {
        user: { id: "user_123" },
        organization: { id: "org_456" },
      },
      headers: new Headers(),
      cookies: createMockCookies(),
    });

    expect(enabled).toBe(false);
  });

  it("returns false when WorkOS is disabled", async () => {
    vi.resetModules();
    vi.doMock("@/lib/workos/config", () => ({
      getWorkosAuthKitConfig: () => null,
    }));

    const { createWorkosAdapter } = await import("./workos-adapter");
    const adapter = createWorkosAdapter()();
    const enabled = await adapter.decide({
      key: WORKSPACE_KNOWLEDGE_FLAG,
      entities: {
        user: { id: "user_123" },
        organization: { id: "org_456" },
      },
      headers: new Headers(),
      cookies: createMockCookies(),
    });

    expect(enabled).toBe(false);
    expect(isEnabled).not.toHaveBeenCalled();

    vi.doUnmock("@/lib/workos/config");
    vi.resetModules();
  });
});

const intl = getIntlShape("en") as IntlShape;

describe("filterNavigationByWorkspaceFlags", () => {
  it("removes Automations and Knowledge when workspace flags are disabled", () => {
    const groups = buildGlobalNavigationGroups("acme", intl);
    const filtered = filterNavigationByWorkspaceFlags(groups, {
      automations: false,
      knowledge: false,
      visualMock: false,
    });

    const itemLabels = filtered.flatMap((group) => group.items.map((item) => item.label));

    expect(itemLabels).not.toContain("Automations");
    expect(itemLabels).not.toContain("Knowledge");
    expect(itemLabels).toContain("Projects");
  });

  it("keeps Automations and Knowledge when workspace flags are enabled", () => {
    const groups = buildGlobalNavigationGroups("acme", intl);
    const filtered = filterNavigationByWorkspaceFlags(groups, {
      automations: true,
      knowledge: true,
      visualMock: true,
    });

    const itemLabels = filtered.flatMap((group) => group.items.map((item) => item.label));

    expect(itemLabels).toContain("Automations");
    expect(itemLabels).toContain("Knowledge");
  });
});
