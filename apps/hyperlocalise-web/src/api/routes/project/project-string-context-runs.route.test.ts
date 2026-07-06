import "dotenv/config";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { app } from "@/api/app";
import { db } from "@/lib/database";

import { createProjectTestFixture } from "./project.fixture";
import type { ProjectFileStringContextRunResponse } from "./project.schema";

const client = testClient(app);
const projectFixture = createProjectTestFixture(client);

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

describe("project file string context runs route", () => {
  it("creates and reuses a durable CAT repository context lookup run", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const payload = {
      repositoryFullName: "acme/web",
      sourcePath: "src/messages/en.json",
      key: "home.title",
      text: "Welcome",
      context: "Hero headline",
    };

    const firstResponse = await client.api.orgs[":organizationSlug"].projects[":projectId"].files[
      "string-context"
    ].runs.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: payload,
      },
      { headers },
    );
    const secondResponse = await client.api.orgs[":organizationSlug"].projects[":projectId"].files[
      "string-context"
    ].runs.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: payload,
      },
      { headers },
    );

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(200);

    const firstBody = (await firstResponse.json()) as ProjectFileStringContextRunResponse;
    const secondBody = (await secondResponse.json()) as ProjectFileStringContextRunResponse;
    expect(firstBody.run).toMatchObject({
      status: "queued",
      currentStage: null,
      reused: false,
    });
    expect(secondBody.run).toMatchObject({
      id: firstBody.run.id,
      status: "queued",
      currentStage: null,
      reused: true,
    });

    const readResponse = await client.api.orgs[":organizationSlug"]["agent-task-runs"][
      ":runId"
    ].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          runId: firstBody.run.id,
        },
      },
      { headers },
    );

    expect(readResponse.status).toBe(200);
    const readBody = await readResponse.json();
    expect(readBody.run).toMatchObject({
      id: firstBody.run.id,
      surface: "cat",
      kind: "repository_context_lookup",
      status: "queued",
    });
    expect(readBody.run.inputSnapshot).toMatchObject({
      sourcePath: payload.sourcePath,
      stringKey: payload.key,
      sourceText: payload.text,
      repositoryFullName: payload.repositoryFullName,
    });
  });
});
