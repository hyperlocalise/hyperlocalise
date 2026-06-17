import { afterEach, describe, expect, it } from "vite-plus/test";
import { eq } from "drizzle-orm";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";

import {
  getCachedProjectFileStringRepositoryContext,
  hashProjectFileStringSourceText,
  listCachedProjectFileStringRepositoryContexts,
  saveProjectFileStringRepositoryContext,
} from "./project-string-context-service";

const fixture = createProjectTestFixture();

describe("project-file-string-context-store", () => {
  afterEach(async () => {
    await fixture.cleanup();
  });

  it("returns cached summaries when the source text hash still matches", async () => {
    const { organization, project, user } = await fixture.createStoredProjectFixture();
    const sourceText = "Sign in to your workspace";

    await saveProjectFileStringRepositoryContext({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/en.json",
      stringKey: "auth.signIn.title",
      repositoryFullName: "hyperlocalise/web",
      sourceText,
      summary: "Hero title on the sign-in page.",
      createdByUserId: user.id,
    });

    const cached = await getCachedProjectFileStringRepositoryContext({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/en.json",
      stringKey: "auth.signIn.title",
      repositoryFullName: "hyperlocalise/web",
      sourceText,
    });

    expect(cached).toBe("Hero title on the sign-in page.");
  });

  it("invalidates cached summaries when the source text changes", async () => {
    const { organization, project, user } = await fixture.createStoredProjectFixture();

    await saveProjectFileStringRepositoryContext({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/en.json",
      stringKey: "auth.signIn.title",
      repositoryFullName: "hyperlocalise/web",
      sourceText: "Sign in to your workspace",
      summary: "Hero title on the sign-in page.",
      createdByUserId: user.id,
    });

    const cached = await getCachedProjectFileStringRepositoryContext({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/en.json",
      stringKey: "auth.signIn.title",
      repositoryFullName: "hyperlocalise/web",
      sourceText: "Sign in to your account",
    });

    expect(cached).toBeNull();
  });

  it("lists cached summaries for a file and prefers the requested repository", async () => {
    const { organization, project, user } = await fixture.createStoredProjectFixture();

    await saveProjectFileStringRepositoryContext({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/en.json",
      stringKey: "auth.signIn.title",
      repositoryFullName: "hyperlocalise/web",
      sourceText: "Sign in to your workspace",
      summary: "Preferred repository context.",
      createdByUserId: user.id,
    });
    await saveProjectFileStringRepositoryContext({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/en.json",
      stringKey: "auth.signIn.title",
      repositoryFullName: "hyperlocalise/legacy",
      sourceText: "Sign in to your workspace",
      summary: "Legacy repository context.",
      createdByUserId: user.id,
    });

    const summaries = await listCachedProjectFileStringRepositoryContexts({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/en.json",
      stringKeys: ["auth.signIn.title"],
      preferredRepositoryFullName: "hyperlocalise/web",
      sourceTextByKey: new Map([["auth.signIn.title", "Sign in to your workspace"]]),
    });

    expect(summaries.get("auth.signIn.title")).toBe("Preferred repository context.");
  });

  it("upserts summaries for the same lookup key", async () => {
    const { organization, project, user } = await fixture.createStoredProjectFixture();

    await saveProjectFileStringRepositoryContext({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/en.json",
      stringKey: "auth.signIn.title",
      repositoryFullName: "hyperlocalise/web",
      sourceText: "Sign in to your workspace",
      summary: "First summary.",
      createdByUserId: user.id,
    });
    await saveProjectFileStringRepositoryContext({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/en.json",
      stringKey: "auth.signIn.title",
      repositoryFullName: "hyperlocalise/web",
      sourceText: "Sign in to your workspace",
      summary: "Updated summary.",
      createdByUserId: user.id,
    });

    const rows = await db
      .select()
      .from(schema.projectFileStringRepositoryContexts)
      .where(eq(schema.projectFileStringRepositoryContexts.projectId, project.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.summary).toBe("Updated summary.");
    expect(hashProjectFileStringSourceText(" Sign in to your workspace ")).toBe(
      rows[0]?.sourceTextHash,
    );
  });
});
