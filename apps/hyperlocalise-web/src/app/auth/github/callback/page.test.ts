import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { redirectMock, getGitHubAppMock, syncInstallationRepositoriesMock, envOverrides } =
  vi.hoisted(() => ({
    redirectMock: vi.fn((location: string) => {
      throw new Error(`redirect:${location}`);
    }),
    getGitHubAppMock: vi.fn(() => ({
      octokit: {
        rest: {
          apps: {
            getInstallation: vi.fn(async () => ({
              data: {
                account: {
                  login: "hyperlocalise",
                  type: "Organization",
                },
              },
            })),
          },
        },
      },
    })),
    syncInstallationRepositoriesMock: vi.fn(async () => []),
    envOverrides: {} as Record<string, string | undefined>,
  }));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/env")>();

  return {
    ...original,
    env: new Proxy(original.env, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && prop in envOverrides) {
          return envOverrides[prop];
        }

        return Reflect.get(target, prop, receiver);
      },
    }),
  };
});

vi.mock("@/lib/agents/github/app", () => ({
  getGitHubApp: getGitHubAppMock,
}));

vi.mock("@/lib/agents/github/repositories", () => ({
  syncInstallationRepositories: syncInstallationRepositoriesMock,
}));

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: vi.fn(() => globalThis.__testApiAuthContext ?? null),
}));

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import {
  GITHUB_STATE_TTL_MS,
  getGitHubStateSecret,
  signGitHubState,
} from "@/lib/agents/github/oauth-state";
import { db, schema } from "@/lib/database";
import GitHubCallbackPage from "./page";

const fixture = createProjectTestFixture();

async function createCallbackState(options?: {
  consumed?: boolean;
  dbExpired?: boolean;
  nullSlug?: boolean;
  role?: "owner" | "admin" | "member";
}) {
  const identity = fixture.createWorkosIdentityWithRole(options?.role ?? "owner");
  if (options?.nullSlug) {
    delete identity.organization.slug;
  }
  await fixture.authHeadersFor(identity);
  const auth = globalThis.__testApiAuthContext;
  if (!auth) {
    throw new Error("missing auth context");
  }

  const slug = auth.organization.slug ?? auth.organization.localOrganizationId;
  const nonce = randomUUID();
  const timestamp = Date.now();
  const payload = `${slug}:${timestamp}:${nonce}`;
  const signature = await signGitHubState(payload, getGitHubStateSecret());
  const state = `${payload}:${signature}`;

  await db.insert(schema.githubInstallationStates).values({
    nonce,
    organizationId: auth.organization.localOrganizationId,
    userId: auth.user.localUserId,
    expiresAt: new Date(timestamp + (options?.dbExpired ? -1 : GITHUB_STATE_TTL_MS)),
    consumedAt: options?.consumed ? new Date() : null,
  });

  return { auth, nonce, slug, state };
}

async function runCallback(state: string, installationId = "123456") {
  return GitHubCallbackPage({
    searchParams: Promise.resolve({
      installation_id: installationId,
      state,
    }),
  });
}

describe("GitHubCallbackPage", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    delete envOverrides.GITHUB_APP_ID;
    await fixture.cleanup();
  });

  it("persists an installation, syncs repositories, and consumes state for the same admin user", async () => {
    const { auth, nonce, slug, state } = await createCallbackState({ role: "admin" });

    await expect(runCallback(state)).rejects.toThrow(
      `redirect:/org/${slug}/settings?github_connected=1`,
    );

    const [installation] = await db
      .select()
      .from(schema.githubInstallations)
      .where(eq(schema.githubInstallations.organizationId, auth.organization.localOrganizationId))
      .limit(1);
    expect(installation).toMatchObject({
      githubInstallationId: "123456",
      githubAppId: "123",
      accountLogin: "hyperlocalise",
      accountType: "Organization",
    });

    const [stateRecord] = await db
      .select()
      .from(schema.githubInstallationStates)
      .where(eq(schema.githubInstallationStates.nonce, nonce))
      .limit(1);
    expect(stateRecord?.consumedAt).toBeInstanceOf(Date);
    expect(syncInstallationRepositoriesMock).toHaveBeenCalledWith({
      organizationId: auth.organization.localOrganizationId,
      githubInstallationId: "123456",
    });
  });

  it("persists an installation when the signed state uses a null-slug organization id", async () => {
    const { auth, nonce, state } = await createCallbackState({
      nullSlug: true,
      role: "admin",
    });

    await expect(runCallback(state)).rejects.toThrow("redirect:/dashboard?github_connected=1");

    const [installation] = await db
      .select()
      .from(schema.githubInstallations)
      .where(eq(schema.githubInstallations.organizationId, auth.organization.localOrganizationId))
      .limit(1);
    expect(installation).toMatchObject({
      githubInstallationId: "123456",
      githubAppId: "123",
    });

    const [stateRecord] = await db
      .select()
      .from(schema.githubInstallationStates)
      .where(eq(schema.githubInstallationStates.nonce, nonce))
      .limit(1);
    expect(stateRecord?.consumedAt).toBeInstanceOf(Date);
    expect(syncInstallationRepositoriesMock).toHaveBeenCalledWith({
      organizationId: auth.organization.localOrganizationId,
      githubInstallationId: "123456",
    });
  });

  it("rejects an invalid signed state", async () => {
    await expect(runCallback("bad")).rejects.toThrow("redirect:/dashboard?error=invalid_state");
    expect(getGitHubAppMock).not.toHaveBeenCalled();
  });

  it("rejects a persisted state that has expired", async () => {
    const { state } = await createCallbackState({ dbExpired: true });

    await expect(runCallback(state)).rejects.toThrow("redirect:/dashboard?error=invalid_state");
    expect(getGitHubAppMock).not.toHaveBeenCalled();
  });

  it("rejects a replayed state", async () => {
    const { state } = await createCallbackState({ consumed: true });

    await expect(runCallback(state)).rejects.toThrow("redirect:/dashboard?error=invalid_state");
    expect(getGitHubAppMock).not.toHaveBeenCalled();
  });

  it("rejects a state completed by a different authenticated user", async () => {
    const { state, slug } = await createCallbackState({ role: "owner" });
    const organization = globalThis.__testApiAuthContext?.organization;
    const replayIdentity = fixture.createWorkosIdentityForOrganization(
      {
        workosOrganizationId: organization?.workosOrganizationId ?? "",
        name: organization?.name ?? "Example Org",
        slug,
      },
      "owner",
    );
    await fixture.authHeadersFor(replayIdentity);

    await expect(runCallback(state)).rejects.toThrow("redirect:/dashboard?error=invalid_state");
    expect(getGitHubAppMock).not.toHaveBeenCalled();
  });

  it("rejects a non-admin member before consuming state", async () => {
    const { nonce, state } = await createCallbackState({ role: "member" });

    await expect(runCallback(state)).rejects.toThrow("redirect:/dashboard?error=forbidden");

    const [stateRecord] = await db
      .select()
      .from(schema.githubInstallationStates)
      .where(eq(schema.githubInstallationStates.nonce, nonce))
      .limit(1);
    expect(stateRecord?.consumedAt).toBeNull();
    expect(getGitHubAppMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid installation id before consuming state", async () => {
    const { nonce, state } = await createCallbackState({ role: "admin" });

    await expect(runCallback(state, "notanumber")).rejects.toThrow(
      "redirect:/dashboard?error=missing_callback_params",
    );

    const [stateRecord] = await db
      .select()
      .from(schema.githubInstallationStates)
      .where(eq(schema.githubInstallationStates.nonce, nonce))
      .limit(1);
    expect(stateRecord?.consumedAt).toBeNull();
    expect(getGitHubAppMock).not.toHaveBeenCalled();
  });

  it("rejects missing GitHub app configuration before consuming state", async () => {
    envOverrides.GITHUB_APP_ID = undefined;
    const { nonce, state } = await createCallbackState({ role: "admin" });

    await expect(runCallback(state)).rejects.toThrow(
      "redirect:/dashboard?error=github_app_not_configured",
    );

    const [stateRecord] = await db
      .select()
      .from(schema.githubInstallationStates)
      .where(eq(schema.githubInstallationStates.nonce, nonce))
      .limit(1);
    expect(stateRecord?.consumedAt).toBeNull();
    expect(getGitHubAppMock).not.toHaveBeenCalled();
  });
});
