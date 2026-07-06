import { describe, expect, it, vi } from "vite-plus/test";

import { smartlingTmsProvider } from "./smartling-provider";

describe("smartlingTmsProvider.fetchProjects", () => {
  const credential = {
    id: "cred-1",
    organizationId: "org-1",
    providerKind: "smartling" as const,
    displayName: "Smartling",
    region: null,
    baseUrl: null,
    validationStatus: "connected",
    validationMessage: null,
    lastValidatedAt: null,
    encryptionAlgorithm: "aes-256-gcm",
    keyVersion: 1,
    ciphertext: "cipher",
    iv: "iv",
    authTag: "tag",
    maskedSecretSuffix: "cret",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("normalizes account projects and locales into the shared provider model", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith("/authenticate")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { accessToken: "access-token", expiresIn: 3600 },
            },
          }),
          { status: 200 },
        );
      }

      if (String(url).includes("/accounts/acct-1/projects")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [
                  {
                    accountUid: "acct-1",
                    projectId: "proj-1",
                    projectName: "Marketing Website",
                    sourceLocaleId: "en-US",
                    archived: false,
                    projectTypeCode: "GDN",
                  },
                ],
                totalCount: 1,
              },
            },
          }),
          { status: 200 },
        );
      }

      if (String(url).includes("/projects/proj-1")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                accountUid: "acct-1",
                projectId: "proj-1",
                projectName: "Marketing Website",
                sourceLocaleId: "en-US",
                archived: false,
                projectTypeCode: "GDN",
                targetLocales: [
                  { localeId: "de-DE", description: "German", enabled: true },
                  { localeId: "fr-FR", description: "French", enabled: false },
                ],
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    vi.stubGlobal("fetch", fetchMock);

    const projects = await smartlingTmsProvider.fetchProjects({
      organizationId: "org-1",
      credential,
      secretMaterial: JSON.stringify({
        userIdentifier: "user-1",
        userSecret: "secret-1",
        accountUid: "acct-1",
      }),
    });

    expect(projects).toHaveLength(1);
    expect(projects[0]).toEqual({
      externalProjectId: "proj-1",
      name: "Marketing Website",
      sourceLocale: "en-US",
      targetLocales: ["de-DE"],
      externalProjectUrl:
        "https://dashboard.smartling.com/app/accounts/acct-1/project/proj-1/dashboard",
      isActive: true,
      metadata: {
        accountUid: "acct-1",
        projectTypeCode: "GDN",
      },
    });
  });

  it("fetches project details with bounded concurrency", async () => {
    let inFlightProjectRequests = 0;
    let maxInFlightProjectRequests = 0;

    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith("/authenticate")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { accessToken: "access-token", expiresIn: 3600 },
            },
          }),
          { status: 200 },
        );
      }

      if (String(url).includes("/accounts/acct-1/projects")) {
        const items = Array.from({ length: 25 }, (_, index) => ({
          accountUid: "acct-1",
          projectId: `proj-${index + 1}`,
          projectName: `Project ${index + 1}`,
          sourceLocaleId: "en-US",
          archived: false,
          projectTypeCode: "GDN",
        }));

        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { items, totalCount: items.length },
            },
          }),
          { status: 200 },
        );
      }

      if (String(url).includes("/projects/proj-")) {
        inFlightProjectRequests += 1;
        maxInFlightProjectRequests = Math.max(maxInFlightProjectRequests, inFlightProjectRequests);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlightProjectRequests -= 1;

        const projectId = String(url).split("/projects/")[1];
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                accountUid: "acct-1",
                projectId,
                projectName: `Project ${projectId}`,
                sourceLocaleId: "en-US",
                archived: false,
                projectTypeCode: "GDN",
                targetLocales: [{ localeId: "de-DE", description: "German", enabled: true }],
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    vi.stubGlobal("fetch", fetchMock);

    const projects = await smartlingTmsProvider.fetchProjects({
      organizationId: "org-1",
      credential,
      secretMaterial: JSON.stringify({
        userIdentifier: "user-1",
        userSecret: "secret-1",
        accountUid: "acct-1",
      }),
    });

    expect(projects).toHaveLength(25);
    expect(maxInFlightProjectRequests).toBeLessThanOrEqual(15);
  });

  it("throws smartling_auth_invalid when authentication fails", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          response: {
            code: "AUTHENTICATION_ERROR",
            errors: [{ message: "Invalid credentials" }],
          },
        }),
        { status: 401 },
      );
    }) as unknown as typeof fetch;

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      smartlingTmsProvider.fetchProjects({
        organizationId: "org-1",
        credential,
        secretMaterial: "user-1:secret-1:acct-1",
      }),
    ).rejects.toThrow("smartling_auth_invalid");
  });
});
