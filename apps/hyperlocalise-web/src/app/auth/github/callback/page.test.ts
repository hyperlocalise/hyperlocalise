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

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    toString: (): string => "test-cookie",
  })),
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
  role?: "admin" | "member";
}) {
  const identity = fixture.createWorkosIdentityWithRole(options?.role ?? "admin");
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

  it("rejects user oauth code callbacks and points admins to setup url", async () => {
    const { state } = await createCallbackState({ role: "admin" });

    await expect(
      GitHubCallbackPage({
        searchParams: Promise.resolve({
          code: "oauth-code-123",
          state,
        }),
      }),
    ).rejects.toThrow("redirect:/dashboard?error=github_use_setup_url");

    expect(getGitHubAppMock).not.toHaveBeenCalled();
  });

  it("persists an installation, syncs repositories, and consumes state for the same admin user", async () => {
    const { auth, nonce, slug, state } = await createCallbackState({ role: "admin" });

    await expect(runCallback(state)).rejects.toThrow(
      `redirect:/org/${slug}/integrations?github_connected=1`,
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
    const { slug, state } = await createCallbackState({ dbExpired: true });

    await expect(runCallback(state)).rejects.toThrow(
      `redirect:/org/${slug}/integrations?error=invalid_state`,
    );
    expect(getGitHubAppMock).not.toHaveBeenCalled();
  });

  it("rejects a replayed state", async () => {
    const { slug, state } = await createCallbackState({ consumed: true });

    await expect(runCallback(state)).rejects.toThrow(
      `redirect:/org/${slug}/integrations?error=invalid_state`,
    );
    expect(getGitHubAppMock).not.toHaveBeenCalled();
  });

  it("rejects linking a GitHub installation already linked to another organization", async () => {
    const { organization: linkedOrg } = await fixture.createStoredProjectFixture();
    await db.insert(schema.githubInstallations).values({
      organizationId: linkedOrg.id,
      githubInstallationId: "123456",
      githubAppId: "123",
      accountLogin: "other-org",
      accountType: "Organization",
    });

    const { auth, slug, state } = await createCallbackState({ role: "admin" });

    await expect(runCallback(state)).rejects.toThrow(
      `redirect:/org/${slug}/integrations?error=github_installation_already_linked`,
    );

    const [linkedInstallation] = await db
      .select()
      .from(schema.githubInstallations)
      .where(eq(schema.githubInstallations.organizationId, linkedOrg.id))
      .limit(1);
    expect(linkedInstallation).toMatchObject({
      githubInstallationId: "123456",
      accountLogin: "other-org",
    });

    const conflictingInstallations = await db
      .select()
      .from(schema.githubInstallations)
      .where(eq(schema.githubInstallations.organizationId, auth.organization.localOrganizationId));
    expect(conflictingInstallations).toHaveLength(0);
    expect(syncInstallationRepositoriesMock).not.toHaveBeenCalled();
  });

  it("rejects when a different org admin completes an installation started by someone else", async () => {
    const { auth, nonce, state, slug } = await createCallbackState({ role: "admin" });
    const organization = globalThis.__testApiAuthContext?.organization;
    const otherAdminIdentity = fixture.createWorkosIdentityForOrganization(
      {
        workosOrganizationId: organization?.workosOrganizationId ?? "",
        name: organization?.name ?? "Example Org",
        slug,
      },
      "admin",
    );
    await fixture.authHeadersFor(otherAdminIdentity);

    await expect(runCallback(state)).rejects.toThrow(
      `redirect:/org/${slug}/integrations?error=invalid_state`,
    );

    const installations = await db
      .select()
      .from(schema.githubInstallations)
      .where(eq(schema.githubInstallations.organizationId, auth.organization.localOrganizationId));
    expect(installations).toHaveLength(0);

    const [stateRecord] = await db
      .select()
      .from(schema.githubInstallationStates)
      .where(eq(schema.githubInstallationStates.nonce, nonce))
      .limit(1);
    expect(stateRecord?.consumedAt).toBeNull();
    expect(getGitHubAppMock).not.toHaveBeenCalled();
  });

  it("rejects the callback when no Hyperlocalise session is present", async () => {
    const { auth, nonce, state } = await createCallbackState({ role: "admin" });
    globalThis.__testApiAuthContext = undefined;

    await expect(runCallback(state)).rejects.toThrow("redirect:/dashboard?error=unauthorized");

    const installations = await db
      .select()
      .from(schema.githubInstallations)
      .where(eq(schema.githubInstallations.organizationId, auth.organization.localOrganizationId));
    expect(installations).toHaveLength(0);

    const [stateRecord] = await db
      .select()
      .from(schema.githubInstallationStates)
      .where(eq(schema.githubInstallationStates.nonce, nonce))
      .limit(1);
    expect(stateRecord?.consumedAt).toBeNull();
    expect(getGitHubAppMock).not.toHaveBeenCalled();
  });

  it("rejects the callback for org members without workspace operator role", async () => {
    const { auth, nonce, state } = await createCallbackState({ role: "member" });

    await expect(runCallback(state)).rejects.toThrow("redirect:/dashboard?error=forbidden");

    const installations = await db
      .select()
      .from(schema.githubInstallations)
      .where(eq(schema.githubInstallations.organizationId, auth.organization.localOrganizationId));
    expect(installations).toHaveLength(0);

    const [stateRecord] = await db
      .select()
      .from(schema.githubInstallationStates)
      .where(eq(schema.githubInstallationStates.nonce, nonce))
      .limit(1);
    expect(stateRecord?.consumedAt).toBeNull();
    expect(getGitHubAppMock).not.toHaveBeenCalled();
  });

  it("redirects when GitHub returns setup_action=request without installation_id", async () => {
    const { state } = await createCallbackState({ role: "admin" });

    await expect(
      GitHubCallbackPage({
        searchParams: Promise.resolve({
          setup_action: "request",
          state,
        }),
      }),
    ).rejects.toThrow("redirect:/dashboard?error=github_install_pending_approval");
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

  it("redirects when GitHub rejects app JWT credentials", async () => {
    const { slug, state } = await createCallbackState({ role: "admin" });
    getGitHubAppMock.mockReturnValueOnce({
      octokit: {
        rest: {
          apps: {
            getInstallation: vi.fn(async () => {
              throw new Error(
                "A JSON web token could not be decoded - https://docs.github.com/rest",
              );
            }),
          },
        },
      },
    });

    await expect(runCallback(state)).rejects.toThrow(
      `redirect:/org/${slug}/integrations?error=github_app_private_key_invalid`,
    );
    expect(syncInstallationRepositoriesMock).not.toHaveBeenCalled();
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
