/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import "dotenv/config";

import { and, eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";

import { createProjectTestFixture } from "./project.fixture";

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

const client = testClient(app);
const projectFixture = createProjectTestFixture(client);

function issueSheet() {
  return client.api.orgs[":organizationSlug"].projects[":projectId"]["issue-sheet"];
}

type IssueResponse = {
  issue: {
    id: string;
    identifier: string;
    title: string;
    issueType: string;
    status: string;
    targetLocale: string | null;
    translationKeyId: string | null;
    linkKind: string | null;
    key: string | null;
    sourceText: string | null;
    templateKey: string | null;
    values: Record<string, unknown>;
    isWatching: boolean;
  };
};

type TemplateConfigResponse = {
  templateConfig: {
    defaultTemplateKey: string | null;
    assigneeByTemplate: { templateKey: string; userId: string; assignable: boolean }[];
  };
};

type IssueSheetListResponse = {
  issues: {
    id: string;
    title?: string;
    issueType?: string;
    status?: string;
    translationKeyId?: string | null;
  }[];
  columns: { key: string }[];
  total: number;
  summary: { open: number };
};

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await projectFixture.cleanup();
});

describe("Issue Sheet routes", () => {
  it("creates, lists, updates, and enriches generic issue rows", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const trackSpy = vi.spyOn(serverAnalytics, "track").mockImplementation(() => {});

    const createResponse = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Source string needs context",
          description: "The CTA is ambiguous.",
          issueType: "context_request",
          targetLocale: "de-DE",
          sourcePath: "messages/home.json",
          segmentId: "cta.save",
          linkKind: "content_editor_segment",
          linkLabel: "Open in Content Editor",
          externalRef: "cat:home:de-DE:cta.save",
          priority: "P1",
        },
      } as never,
      { headers: headers },
    );

    expect(createResponse.status).toBe(201);
    const createdBody = (await createResponse.json()) as IssueResponse;
    expect(createdBody.issue).toMatchObject({
      title: "Source string needs context",
      issueType: "context_request",
      status: "open",
      targetLocale: "de-DE",
      values: { priority: "P1" },
    });
    expect(trackSpy).toHaveBeenCalledWith(PRODUCT_USAGE_ANALYTICS_EVENTS.issueCreated, {
      status: "created",
      source: "issue_sheet",
    });
    trackSpy.mockRestore();

    const listResponse = await issueSheet().$get(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        query: { view: "all_open" },
      } as never,
      { headers: headers },
    );

    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as IssueSheetListResponse;
    expect(listBody.issues).toHaveLength(1);
    expect(listBody.summary.open).toBe(1);
    expect(listBody.columns.map((column) => column.key)).toEqual([
      "priority",
      "owner_note",
      "context",
    ]);

    const viewWithStatusResponse = await issueSheet().$get(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        query: { view: "all_open", status: "resolved" },
      } as never,
      { headers: headers },
    );

    expect(viewWithStatusResponse.status).toBe(200);
    const viewWithStatusBody = (await viewWithStatusResponse.json()) as IssueSheetListResponse;
    expect(viewWithStatusBody.issues).toHaveLength(0);

    const issueId = createdBody.issue.identifier;

    const getIssueResponse = await issueSheet()[":issueId"].$get(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id, issueId: issueId },
      } as never,
      { headers: headers },
    );
    expect(getIssueResponse.status).toBe(200);
    const getIssueBody = (await getIssueResponse.json()) as IssueResponse;
    expect(getIssueBody.issue.identifier).toBe(issueId);
    expect(getIssueBody.issue.title).toBe("Source string needs context");

    const missingIssueResponse = await issueSheet()[":issueId"].$get(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: "ZZZ-99999",
        },
      } as never,
      { headers: headers },
    );
    expect(missingIssueResponse.status).toBe(404);

    const updateResponse = await issueSheet()[":issueId"].$patch(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id, issueId: issueId },
        json: { status: "in_progress" },
      } as never,
      { headers: headers },
    );

    expect(updateResponse.status).toBe(200);
    const updatedBody = (await updateResponse.json()) as IssueResponse;
    expect(updatedBody.issue.status).toBe("in_progress");

    const columnResponse = await issueSheet().columns.$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          key: "sprint",
          label: "Sprint",
          type: "select",
          config: { options: [{ id: "S24", label: "S24" }] },
        },
      } as never,
      { headers: headers },
    );

    expect(columnResponse.status).toBe(201);

    const valueResponse = await issueSheet()[":issueId"].values.$patch(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id, issueId: issueId },
        json: { columnKey: "sprint", value: "S24" },
      } as never,
      { headers: headers },
    );

    expect(valueResponse.status).toBe(200);
  });

  it("lists starter columns and created custom columns via GET /columns", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const columnsResponse = await issueSheet().columns.$get(
      { param: { organizationSlug: organizationSlug, projectId: project.id } } as never,
      { headers: headers },
    );

    expect(columnsResponse.status).toBe(200);
    const columnsBody = (await columnsResponse.json()) as {
      columns: Array<{ key: string; label: string; type: string }>;
    };
    expect(columnsBody.columns.map((column) => column.key)).toEqual([
      "priority",
      "owner_note",
      "context",
    ]);
    expect(columnsBody.columns.find((column) => column.key === "context")).toMatchObject({
      type: "enrichment",
      label: "Context",
    });

    const createColumnResponse = await issueSheet().columns.$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          key: "component",
          label: "Component",
          type: "text",
          config: {},
        },
      } as never,
      { headers: headers },
    );
    expect(createColumnResponse.status).toBe(201);

    const columnsAfterResponse = await issueSheet().columns.$get(
      { param: { organizationSlug: organizationSlug, projectId: project.id } } as never,
      { headers: headers },
    );
    expect(columnsAfterResponse.status).toBe(200);
    const columnsAfterBody = (await columnsAfterResponse.json()) as {
      columns: Array<{ key: string }>;
    };
    expect(columnsAfterBody.columns.map((column) => column.key)).toEqual([
      "priority",
      "owner_note",
      "context",
      "component",
    ]);
  });

  it("updates, reorders, hides, and deletes custom columns", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createColumnResponse = await issueSheet().columns.$post(
      {
        param: { organizationSlug, projectId: project.id },
        json: {
          key: "component",
          label: "Component",
          type: "text",
          config: {},
        },
      } as never,
      { headers },
    );
    expect(createColumnResponse.status).toBe(201);
    const createdColumn = (await createColumnResponse.json()) as {
      column: { id: string; key: string; hidden: boolean };
    };

    const patchResponse = await issueSheet().columns[":columnId"].$patch(
      {
        param: {
          organizationSlug,
          projectId: project.id,
          columnId: createdColumn.column.id,
        },
        json: { label: "Module", hidden: true },
      } as never,
      { headers },
    );
    expect(patchResponse.status).toBe(200);
    const patchedBody = (await patchResponse.json()) as {
      column: { label: string; hidden: boolean };
    };
    expect(patchedBody.column).toMatchObject({ label: "Module", hidden: true });

    const columnsResponse = await issueSheet().columns.$get(
      { param: { organizationSlug, projectId: project.id } } as never,
      { headers },
    );
    expect(columnsResponse.status).toBe(200);
    const columnsBody = (await columnsResponse.json()) as {
      columns: Array<{ id: string; key: string }>;
    };
    const reorderedIds = [
      createdColumn.column.id,
      ...columnsBody.columns
        .filter((column) => column.id !== createdColumn.column.id)
        .map((column) => column.id),
    ];

    const orderResponse = await issueSheet().columns.order.$put(
      {
        param: { organizationSlug, projectId: project.id },
        json: { columnIds: reorderedIds },
      } as never,
      { headers },
    );
    expect(orderResponse.status).toBe(200);
    const orderBody = (await orderResponse.json()) as { columns: Array<{ key: string }> };
    expect(orderBody.columns.map((column) => column.key)[0]).toBe("component");

    const protectedColumn = columnsBody.columns.find((column) => column.key === "priority");
    expect(protectedColumn).toBeTruthy();
    const deleteProtectedResponse = await issueSheet().columns[":columnId"].$delete(
      {
        param: {
          organizationSlug,
          projectId: project.id,
          columnId: protectedColumn!.id,
        },
      } as never,
      { headers },
    );
    expect(deleteProtectedResponse.status).toBe(400);

    const deleteResponse = await issueSheet().columns[":columnId"].$delete(
      {
        param: {
          organizationSlug,
          projectId: project.id,
          columnId: createdColumn.column.id,
        },
      } as never,
      { headers },
    );
    expect(deleteResponse.status).toBe(204);

    const columnsAfterDelete = await issueSheet().columns.$get(
      { param: { organizationSlug, projectId: project.id } } as never,
      { headers },
    );
    const columnsAfterBody = (await columnsAfterDelete.json()) as {
      columns: Array<{ key: string }>;
    };
    expect(columnsAfterBody.columns.map((column) => column.key)).toEqual([
      "priority",
      "owner_note",
      "context",
    ]);
  });

  it("persists, updates, and clears a custom column icon", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createColumnResponse = await issueSheet().columns.$post(
      {
        param: { organizationSlug, projectId: project.id },
        json: {
          key: "sprint",
          label: "Sprint",
          type: "text",
          icon: "calendar",
        },
      } as never,
      { headers },
    );
    expect(createColumnResponse.status).toBe(201);
    const createdColumn = (await createColumnResponse.json()) as {
      column: { id: string; icon: string | null };
    };
    expect(createdColumn.column.icon).toBe("calendar");

    const patchResponse = await issueSheet().columns[":columnId"].$patch(
      {
        param: {
          organizationSlug,
          projectId: project.id,
          columnId: createdColumn.column.id,
        },
        json: { icon: "bug" },
      } as never,
      { headers },
    );
    expect(patchResponse.status).toBe(200);
    const patchedBody = (await patchResponse.json()) as { column: { icon: string | null } };
    expect(patchedBody.column.icon).toBe("bug");

    const clearResponse = await issueSheet().columns[":columnId"].$patch(
      {
        param: {
          organizationSlug,
          projectId: project.id,
          columnId: createdColumn.column.id,
        },
        json: { icon: null },
      } as never,
      { headers },
    );
    expect(clearResponse.status).toBe(200);
    const clearedBody = (await clearResponse.json()) as { column: { icon: string | null } };
    expect(clearedBody.column.icon).toBeNull();

    const columnsResponse = await issueSheet().columns.$get(
      { param: { organizationSlug, projectId: project.id } } as never,
      { headers },
    );
    expect(columnsResponse.status).toBe(200);
    const columnsBody = (await columnsResponse.json()) as {
      columns: Array<{ id: string; key: string }>;
    };
    const protectedColumn = columnsBody.columns.find((column) => column.key === "priority");
    expect(protectedColumn).toBeTruthy();
    const protectedIconResponse = await issueSheet().columns[":columnId"].$patch(
      {
        param: {
          organizationSlug,
          projectId: project.id,
          columnId: protectedColumn!.id,
        },
        json: { icon: "flag" },
      } as never,
      { headers },
    );
    expect(protectedIconResponse.status).toBe(400);

    const unknownIconResponse = await issueSheet().columns.$post(
      {
        param: { organizationSlug, projectId: project.id },
        json: {
          key: "invalid_icon",
          label: "Invalid",
          type: "text",
          icon: "not-an-icon",
        },
      } as never,
      { headers },
    );
    expect(unknownIconResponse.status).toBe(400);
  });

  it("returns custom column values on GET issue", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Issue with custom fields",
          issueType: "general_question",
        },
      } as never,
      { headers: headers },
    );
    expect(createResponse.status).toBe(201);
    const createdBody = (await createResponse.json()) as IssueResponse;
    const issueId = createdBody.issue.id;

    await issueSheet().columns.$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          key: "sprint",
          label: "Sprint",
          type: "select",
          config: { options: [{ id: "S24", label: "S24" }] },
        },
      } as never,
      { headers: headers },
    );

    const valueResponse = await issueSheet()[":issueId"].values.$patch(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id, issueId: issueId },
        json: { columnKey: "sprint", value: "S24" },
      } as never,
      { headers: headers },
    );
    expect(valueResponse.status).toBe(200);

    const getIssueResponse = await issueSheet()[":issueId"].$get(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id, issueId: issueId },
      } as never,
      { headers: headers },
    );
    expect(getIssueResponse.status).toBe(200);
    const getIssueBody = (await getIssueResponse.json()) as IssueResponse;
    expect(getIssueBody.issue.values).toMatchObject({
      sprint: "S24",
    });
  });

  it("persists custom column values from the create payload", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    await issueSheet().columns.$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          key: "sprint",
          label: "Sprint",
          type: "select",
          config: { options: [{ id: "S24", label: "S24" }] },
        },
      } as never,
      { headers: headers },
    );
    await issueSheet().columns.$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          key: "component",
          label: "Component",
          type: "text",
        },
      } as never,
      { headers: headers },
    );

    const createResponse = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Issue with create-time values",
          issueType: "general_question",
          status: "in_progress",
          priority: "P0",
          values: {
            priority: "P2",
            sprint: "S24",
            component: "Checkout",
          },
        },
      } as never,
      { headers: headers },
    );

    expect(createResponse.status).toBe(201);
    const createdBody = (await createResponse.json()) as IssueResponse;
    expect(createdBody.issue).toMatchObject({
      status: "in_progress",
      values: {
        priority: "P0",
        sprint: "S24",
        component: "Checkout",
      },
    });
  });

  it("rejects invalid select values in the create payload", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    await issueSheet().columns.$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          key: "sprint",
          label: "Sprint",
          type: "select",
          config: { options: [{ id: "S24", label: "S24" }] },
        },
      } as never,
      { headers: headers },
    );

    const createResponse = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Bad select value",
          values: { sprint: "S99" },
        },
      } as never,
      { headers: headers },
    );

    expect(createResponse.status).toBe(400);
    await expect(createResponse.json()).resolves.toMatchObject({
      error: "invalid_issue_sheet_select_value",
    });

    const persistedIssues = await db
      .select({ id: schema.issueSheetIssues.id })
      .from(schema.issueSheetIssues)
      .where(
        and(
          eq(schema.issueSheetIssues.organizationId, organization.id),
          eq(schema.issueSheetIssues.projectId, project.id),
          eq(schema.issueSheetIssues.title, "Bad select value"),
        ),
      );
    expect(persistedIssues).toEqual([]);
  });

  it("ignores values.priority when top-level priority is omitted", async () => {
    // createIssue skips columnKey === "priority" inside values so top-level
    // priority remains the sole write path. API clients that only set
    // values.priority must not silently receive a stored priority.
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Values priority only",
          values: { priority: "P1" },
        },
      } as never,
      { headers: headers },
    );

    expect(createResponse.status).toBe(201);
    const createdBody = (await createResponse.json()) as IssueResponse;
    expect(createdBody.issue.values.priority).toBeUndefined();
  });

  it("rolls back create when a later custom value is invalid", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    await issueSheet().columns.$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          key: "component",
          label: "Component",
          type: "text",
        },
      } as never,
      { headers: headers },
    );
    await issueSheet().columns.$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          key: "sprint",
          label: "Sprint",
          type: "select",
          config: { options: [{ id: "S24", label: "S24" }] },
        },
      } as never,
      { headers: headers },
    );

    const createResponse = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Partial values rollback",
          values: {
            component: "Checkout",
            sprint: "S99",
          },
        },
      } as never,
      { headers: headers },
    );

    expect(createResponse.status).toBe(400);
    await expect(createResponse.json()).resolves.toMatchObject({
      error: "invalid_issue_sheet_select_value",
    });

    const persistedIssues = await db
      .select({ id: schema.issueSheetIssues.id })
      .from(schema.issueSheetIssues)
      .where(
        and(
          eq(schema.issueSheetIssues.organizationId, organization.id),
          eq(schema.issueSheetIssues.projectId, project.id),
          eq(schema.issueSheetIssues.title, "Partial values rollback"),
        ),
      );
    expect(persistedIssues).toEqual([]);
  });

  it("rejects unknown custom column keys in the create payload", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Unknown custom column",
          values: { missing_column: "S24" },
        },
      } as never,
      { headers: headers },
    );

    expect(createResponse.status).toBe(400);
    await expect(createResponse.json()).resolves.toMatchObject({
      error: "issue_sheet_column_not_found",
    });

    const persistedIssues = await db
      .select({ id: schema.issueSheetIssues.id })
      .from(schema.issueSheetIssues)
      .where(
        and(
          eq(schema.issueSheetIssues.organizationId, organization.id),
          eq(schema.issueSheetIssues.projectId, project.id),
          eq(schema.issueSheetIssues.title, "Unknown custom column"),
        ),
      );
    expect(persistedIssues).toEqual([]);
  });

  it("deduplicates open rows for the same external reference", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const payload = {
      title: "Repeated CAT context request",
      issueType: "context_request",
      targetLocale: "fr-FR",
      sourcePath: "messages/home.json",
      segmentId: "headline",
      externalRef: "cat:home:fr-FR:headline",
    };

    const first = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: payload,
      } as never,
      { headers: headers },
    );
    const second = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: payload,
      } as never,
      { headers: headers },
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstBody = (await first.json()) as IssueResponse;
    const secondBody = (await second.json()) as IssueResponse;
    expect(secondBody.issue.id).toBe(firstBody.issue.id);

    const listResponse = await issueSheet().$get(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        query: { status: "all" },
      } as never,
      { headers: headers },
    );
    const listBody = (await listResponse.json()) as IssueSheetListResponse;
    expect(listBody.issues).toHaveLength(1);
  });

  it("returns a resolved row for repeated external references", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const payload = {
      title: "Resolved CAT context request",
      issueType: "context_request",
      targetLocale: "fr-FR",
      sourcePath: "messages/home.json",
      segmentId: "headline",
      externalRef: "cat:home:fr-FR:resolved-headline",
    };

    const first = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: payload,
      } as never,
      { headers: headers },
    );

    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as IssueResponse;

    const resolveResponse = await issueSheet()[":issueId"].$patch(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: firstBody.issue.identifier,
        },
        json: { status: "resolved" },
      } as never,
      { headers: headers },
    );
    expect(resolveResponse.status).toBe(200);

    const repeated = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: payload,
      } as never,
      { headers: headers },
    );

    expect(repeated.status).toBe(201);
    const repeatedBody = (await repeated.json()) as IssueResponse;
    expect(repeatedBody.issue.id).toBe(firstBody.issue.id);
    expect(repeatedBody.issue.status).toBe("resolved");

    const listResponse = await issueSheet().$get(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        query: { status: "all" },
      } as never,
      { headers: headers },
    );
    const listBody = (await listResponse.json()) as IssueSheetListResponse;
    expect(listBody.issues).toHaveLength(1);
  });

  it("imports issues from csv with dry run and duplicate skip", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const csv = `Summary,Status,External ID,Priority
First import issue,Open,EXT-1,P1
Second import issue,Done,EXT-2,P2`;

    const mapping = [
      { csvHeader: "Summary", target: { kind: "system", field: "title" } },
      { csvHeader: "Status", target: { kind: "system", field: "status" } },
      { csvHeader: "External ID", target: { kind: "system", field: "external_ref" } },
      {
        csvHeader: "Priority",
        target: { kind: "create", key: "csv_priority", label: "CSV Priority", type: "select" },
      },
    ];

    const previewResponse = await issueSheet().import.$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          content: csv,
          dryRun: true,
          mapping,
        },
      } as never,
      { headers: headers },
    );
    expect(previewResponse.status).toBe(200);
    const previewBody = (await previewResponse.json()) as {
      import: { created: number; skippedDuplicates: number };
    };
    expect(previewBody.import.created).toBe(2);
    expect(previewBody.import.skippedDuplicates).toBe(0);

    const importResponse = await issueSheet().import.$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          content: csv,
          dryRun: false,
          mapping,
        },
      } as never,
      { headers: headers },
    );
    expect(importResponse.status).toBe(201);
    const importBody = (await importResponse.json()) as {
      import: { created: number; skippedDuplicates: number };
    };
    expect(importBody.import.created).toBe(2);

    const reimportResponse = await issueSheet().import.$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          content: csv,
          dryRun: true,
          mapping,
        },
      } as never,
      { headers: headers },
    );
    const reimportBody = (await reimportResponse.json()) as {
      import: { created: number; skippedDuplicates: number };
    };
    expect(reimportBody.import.created).toBe(0);
    expect(reimportBody.import.skippedDuplicates).toBe(2);

    const listResponse = await issueSheet().$get(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        query: { status: "all" },
      } as never,
      { headers: headers },
    );
    const listBody = (await listResponse.json()) as IssueSheetListResponse;
    expect(listBody.issues).toHaveLength(2);
  });

  it("filters and sorts built-in views with stable pagination", async () => {
    const { identity, project, user } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const payloads = [
      {
        title: "QA triage candidate",
        issueType: "qa_failure",
        status: "open",
        targetLocale: "de-DE",
        priority: "P0",
      },
      {
        title: "My work candidate",
        issueType: "translation_mistake",
        status: "open",
        assigneeUserId: user.id,
        targetLocale: "fr-FR",
        priority: "P2",
      },
      {
        title: "Source context candidate",
        issueType: "source_mistake",
        status: "in_progress",
        targetLocale: "de-DE",
        priority: "P1",
      },
    ] as const;

    for (const payload of payloads) {
      const response = await issueSheet().$post(
        {
          param: { organizationSlug: organizationSlug, projectId: project.id },
          json: payload,
        } as never,
        { headers: headers },
      );
      expect(response.status).toBe(201);
    }

    const qaTriage = await issueSheet().$get(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        query: { view: "qa_triage" },
      } as never,
      { headers: headers },
    );
    const qaTriageBody = (await qaTriage.json()) as IssueSheetListResponse;
    expect(qaTriageBody.issues.map((issue) => issue.title)).toEqual(["QA triage candidate"]);
    expect(qaTriageBody.total).toBe(1);

    const myWork = await issueSheet().$get(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        query: { view: "my_work" },
      } as never,
      { headers: headers },
    );
    const myWorkBody = (await myWork.json()) as IssueSheetListResponse;
    expect(myWorkBody.issues.map((issue) => issue.title)).toEqual(["My work candidate"]);

    const filtered = await issueSheet().$get(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        query: {
          view: "all_open",
          locale: "de-DE",
          assignee: "unassigned",
          sort: "priority",
          sortDir: "asc",
          limit: "10",
          offset: "0",
        },
      } as never,
      { headers: headers },
    );
    const filteredBody = (await filtered.json()) as IssueSheetListResponse;
    expect(filteredBody.issues.map((issue) => issue.title)).toEqual([
      "QA triage candidate",
      "Source context candidate",
    ]);

    const pageOne = await issueSheet().$get(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        query: {
          view: "all_open",
          sort: "priority",
          limit: "2",
          offset: "0",
        },
      } as never,
      { headers: headers },
    );
    const pageTwo = await issueSheet().$get(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        query: {
          view: "all_open",
          sort: "priority",
          limit: "2",
          offset: "2",
        },
      } as never,
      { headers: headers },
    );
    const pageOneBody = (await pageOne.json()) as IssueSheetListResponse;
    const pageTwoBody = (await pageTwo.json()) as IssueSheetListResponse;
    expect(pageOneBody.issues).toHaveLength(2);
    expect(pageTwoBody.issues).toHaveLength(1);
    expect(
      new Set([...pageOneBody.issues, ...pageTwoBody.issues].map((issue) => issue.id)).size,
    ).toBe(3);
  });

  it("rejects duplicate system field mappings", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await issueSheet().import.$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          content: "Title,Summary\nIssue one,Issue two",
          dryRun: true,
          mapping: [
            { csvHeader: "Title", target: { kind: "system", field: "title" } },
            { csvHeader: "Summary", target: { kind: "system", field: "title" } },
          ],
        },
      } as never,
      { headers: headers },
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_issue_sheet_import_payload");
  });

  it("rejects cross-project and missing issue access on GET", async () => {
    const { identity, organization, user, project } =
      await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const [otherProject] = await db
      .insert(schema.projects)
      .values({
        id: `project_${crypto.randomUUID()}`,
        identifier: uniqueTestProjectIdentifier(),
        organizationId: organization.id,
        teamId: project.teamId,
        createdByUserId: user.id,
        name: "Other Project",
        description: "",
        translationContext: "",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      })
      .returning();

    const createResponse = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Owned by first project",
          issueType: "general_question",
        },
      } as never,
      { headers: headers },
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as IssueResponse;

    const crossProjectResponse = await issueSheet()[":issueId"].$get(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: otherProject.id,
          issueId: created.issue.identifier,
        },
      } as never,
      { headers: headers },
    );
    expect(crossProjectResponse.status).toBe(404);
    await expect(crossProjectResponse.json()).resolves.toMatchObject({
      error: "issue_not_found",
    });

    const missingResponse = await issueSheet()[":issueId"].$get(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: "ZZZ-99999",
        },
      } as never,
      { headers: headers },
    );
    expect(missingResponse.status).toBe(404);
  });

  it("rejects cross-workspace issue access on GET", async () => {
    const owner = await projectFixture.createStoredProjectFixture();
    const outsider = await projectFixture.createStoredProjectFixture();
    const ownerHeaders = await projectFixture.authHeadersFor(owner.identity);
    const outsiderHeaders = await projectFixture.authHeadersFor(outsider.identity);
    const ownerSlug = owner.identity.organization.slug ?? "missing-slug";

    const createResponse = await issueSheet().$post(
      {
        param: { organizationSlug: ownerSlug, projectId: owner.project.id },
        json: {
          title: "Private org issue",
          issueType: "general_question",
        },
      } as never,
      { headers: ownerHeaders },
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as IssueResponse;

    const response = await issueSheet()[":issueId"].$get(
      {
        param: {
          organizationSlug: ownerSlug,
          projectId: owner.project.id,
          issueId: created.issue.identifier,
        },
      } as never,
      { headers: outsiderHeaders },
    );
    expect(response.status).toBe(404);
  });

  it("assigns members, rejects invalid assignees, and records activity", async () => {
    const { identity, organization, project, user } =
      await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const teammateIdentity = projectFixture.createWorkosIdentityForOrganization(
      identity.organization,
      "translator",
    );
    await projectFixture.authHeadersFor(teammateIdentity);
    const teammateLocalId = await projectFixture.getLocalUserId(teammateIdentity.user.workosUserId);
    await db.insert(schema.teamMemberships).values({
      teamId: project.teamId!,
      userId: teammateLocalId,
      role: "member",
    });

    const outsiderIdentity = projectFixture.createWorkosIdentityForOrganization(
      identity.organization,
      "translator",
    );
    await projectFixture.authHeadersFor(outsiderIdentity);
    const outsiderLocalId = await projectFixture.getLocalUserId(outsiderIdentity.user.workosUserId);

    const [invitedUser] = await db
      .insert(schema.users)
      .values({
        workosUserId: `invited_user_${crypto.randomUUID()}`,
        email: `invited-${crypto.randomUUID()}@example.com`,
        firstName: "Invited",
        lastName: "User",
      })
      .returning();
    await db.insert(schema.organizationMemberships).values({
      organizationId: organization.id,
      userId: invitedUser.id,
      role: "translator",
      workosMembershipId: null,
    });

    const createResponse = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Assigned on create",
          issueType: "general_question",
          assigneeUserId: teammateLocalId,
        },
      } as never,
      { headers: headers },
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as IssueResponse & {
      issue: { assigneeUserId: string | null };
    };
    expect(created.issue.assigneeUserId).toBe(teammateLocalId);

    const activitiesResponse = await issueSheet()[":issueId"].feed.$get(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
      } as never,
      { headers: headers },
    );
    expect(activitiesResponse.status).toBe(200);
    const activitiesBody = (await activitiesResponse.json()) as {
      items: Array<
        | {
            kind: "activity";
            activity: {
              type: string;
              nextAssignee?: { userId: string } | null;
              previousAssignee?: { userId: string } | null;
            };
          }
        | { kind: "comment_thread" }
      >;
      total: number;
    };
    expect(activitiesBody.total).toBe(2);
    expect(
      activitiesBody.items
        .filter((item) => item.kind === "activity")
        .map((item) => item.activity.type),
    ).toEqual(["issue_created", "assignee_changed"]);
    const assigneeChanged = activitiesBody.items.find(
      (item) => item.kind === "activity" && item.activity.type === "assignee_changed",
    );
    expect(assigneeChanged).toMatchObject({
      kind: "activity",
      activity: {
        type: "assignee_changed",
        nextAssignee: { userId: teammateLocalId },
        previousAssignee: null,
      },
    });

    const assignableResponse = await issueSheet()["assignable-members"].$get(
      { param: { organizationSlug: organizationSlug, projectId: project.id } } as never,
      { headers: headers },
    );
    expect(assignableResponse.status).toBe(200);
    const assignableBody = (await assignableResponse.json()) as {
      members: Array<{ userId: string }>;
    };
    const assignableIds = new Set(assignableBody.members.map((member) => member.userId));
    expect(assignableIds.has(user.id)).toBe(true);
    expect(assignableIds.has(teammateLocalId)).toBe(true);
    expect(assignableIds.has(outsiderLocalId)).toBe(false);
    expect(assignableIds.has(invitedUser.id)).toBe(false);

    const rejectInvited = await issueSheet()[":issueId"].$patch(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
        json: { assigneeUserId: invitedUser.id },
      } as never,
      { headers: headers },
    );
    expect(rejectInvited.status).toBe(400);
    expect(((await rejectInvited.json()) as { error: string }).error).toBe(
      "assignee_not_assignable",
    );

    const rejectOutsider = await issueSheet()[":issueId"].$patch(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
        json: { assigneeUserId: outsiderLocalId },
      } as never,
      { headers: headers },
    );
    expect(rejectOutsider.status).toBe(400);
    expect(((await rejectOutsider.json()) as { error: string }).error).toBe(
      "assignee_not_assignable",
    );

    const unassign = await issueSheet()[":issueId"].$patch(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
        json: { assigneeUserId: null },
      } as never,
      { headers: headers },
    );
    expect(unassign.status).toBe(200);

    const activitiesAfter = await issueSheet()[":issueId"].feed.$get(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
      } as never,
      { headers: headers },
    );
    const activitiesAfterBody = (await activitiesAfter.json()) as {
      items: Array<
        | {
            kind: "activity";
            activity: { type: string; nextAssignee?: { userId: string } | null };
          }
        | { kind: "comment_thread" }
      >;
      total: number;
    };
    expect(activitiesAfterBody.total).toBe(3);
    const lastAfterUnassign = activitiesAfterBody.items.at(-1);
    expect(lastAfterUnassign).toMatchObject({
      kind: "activity",
      activity: { type: "assignee_changed", nextAssignee: null },
    });

    const statusChange = await issueSheet()[":issueId"].$patch(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
        json: { status: "in_progress" },
      } as never,
      { headers: headers },
    );
    expect(statusChange.status).toBe(200);

    const activitiesAfterStatus = await issueSheet()[":issueId"].feed.$get(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
      } as never,
      { headers: headers },
    );
    const activitiesAfterStatusBody = (await activitiesAfterStatus.json()) as {
      items: Array<
        | {
            kind: "activity";
            activity: {
              type: string;
              previousStatus?: string;
              nextStatus?: string;
            };
          }
        | { kind: "comment_thread" }
      >;
      total: number;
    };
    expect(activitiesAfterStatusBody.total).toBe(4);
    expect(activitiesAfterStatusBody.items.at(-1)).toMatchObject({
      kind: "activity",
      activity: {
        type: "status_changed",
        previousStatus: "open",
        nextStatus: "in_progress",
      },
    });

    const reassign = await issueSheet()[":issueId"].$patch(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
        json: { assigneeUserId: teammateLocalId },
      } as never,
      { headers: headers },
    );
    expect(reassign.status).toBe(200);

    await db
      .delete(schema.organizationMemberships)
      .where(eq(schema.organizationMemberships.userId, teammateLocalId));

    const getAfterRemoval = await issueSheet()[":issueId"].$get(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
      } as never,
      { headers: headers },
    );
    expect(getAfterRemoval.status).toBe(200);
    const afterRemoval = (await getAfterRemoval.json()) as {
      issue: { assigneeUserId: string | null; assignee: string | null };
    };
    expect(afterRemoval.issue.assigneeUserId).toBe(teammateLocalId);
    expect(afterRemoval.issue.assignee).toBeTruthy();

    const rejectRemoved = await issueSheet()[":issueId"].$patch(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
        json: { assigneeUserId: teammateLocalId },
      } as never,
      { headers: headers },
    );
    expect(rejectRemoved.status).toBe(400);
  });

  it("returns a unified feed of activities and comment threads ordered in SQL", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Feed interleave",
          issueType: "general_question",
        },
      } as never,
      { headers: headers },
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as IssueResponse;

    const commentResponse = await issueSheet()[":issueId"].comments.$post(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
        json: { body: "Root comment" },
      } as never,
      { headers: headers },
    );
    expect(commentResponse.status).toBe(201);
    const commentBody = (await commentResponse.json()) as {
      issueComment: { id: string; path: string };
    };

    const replyResponse = await issueSheet()[":issueId"].comments.$post(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
        json: { body: "Reply comment", parentId: commentBody.issueComment.id },
      } as never,
      { headers: headers },
    );
    expect(replyResponse.status).toBe(201);

    const statusChange = await issueSheet()[":issueId"].$patch(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
        json: { status: "in_progress" },
      } as never,
      { headers: headers },
    );
    expect(statusChange.status).toBe(200);

    const feedResponse = await issueSheet()[":issueId"].feed.$get(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
      } as never,
      { headers: headers },
    );
    expect(feedResponse.status).toBe(200);
    const feedBody = (await feedResponse.json()) as {
      items: Array<
        | { kind: "activity"; activity: { type: string } }
        | {
            kind: "comment_thread";
            root: { id: string; body: string };
            replies: Array<{ id: string; body: string; parentId: string | null }>;
          }
      >;
      total: number;
      nextCursor: string | null;
    };

    expect(feedBody.total).toBe(3);
    expect(feedBody.nextCursor).toBeNull();
    expect(feedBody.items.map((item) => item.kind)).toEqual([
      "activity",
      "comment_thread",
      "activity",
    ]);
    expect(feedBody.items[0]).toMatchObject({
      kind: "activity",
      activity: { type: "issue_created" },
    });
    expect(feedBody.items[1]).toMatchObject({
      kind: "comment_thread",
      root: { id: commentBody.issueComment.id, body: "Root comment" },
    });
    const thread = feedBody.items[1];
    if (thread?.kind !== "comment_thread") {
      throw new Error("expected comment_thread");
    }
    expect(thread.replies).toHaveLength(1);
    expect(thread.replies[0]).toMatchObject({
      body: "Reply comment",
      parentId: commentBody.issueComment.id,
    });
    expect(feedBody.items[2]).toMatchObject({
      kind: "activity",
      activity: { type: "status_changed" },
    });

    const pageOne = await issueSheet()[":issueId"].feed.$get(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
        query: { limit: "2" },
      } as never,
      { headers: headers },
    );
    expect(pageOne.status).toBe(200);
    const pageOneBody = (await pageOne.json()) as {
      items: Array<{ kind: string }>;
      nextCursor: string | null;
      total: number;
    };
    expect(pageOneBody.total).toBe(3);
    expect(pageOneBody.items).toHaveLength(2);
    expect(pageOneBody.nextCursor).toBeTruthy();

    const pageTwo = await issueSheet()[":issueId"].feed.$get(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
        query: { limit: "2", cursor: pageOneBody.nextCursor! },
      } as never,
      { headers: headers },
    );
    expect(pageTwo.status).toBe(200);
    const pageTwoBody = (await pageTwo.json()) as {
      items: Array<{ kind: string; activity?: { type: string } }>;
      nextCursor: string | null;
    };
    expect(pageTwoBody.items).toHaveLength(1);
    expect(pageTwoBody.items[0]).toMatchObject({
      kind: "activity",
      activity: { type: "status_changed" },
    });
    expect(pageTwoBody.nextCursor).toBeNull();
  });

  it("creates multiple issues linked to the same translation key", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const [translationKey] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        key: "home.cta",
        sourceText: "Save changes",
        normalizedSourceText: "Save changes",
      })
      .returning();

    const payload = {
      title: "Context needed: home.cta",
      issueType: "context_request",
      targetLocale: "fr-FR",
      sourcePath: "messages/home.json",
      segmentId: translationKey.id,
      translationKeyId: translationKey.id,
      linkKind: "content_editor_segment",
    };

    const first = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: payload,
      } as never,
      { headers: headers },
    );
    const second = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: { ...payload, title: "Second context request" },
      } as never,
      { headers: headers },
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstBody = (await first.json()) as IssueResponse;
    const secondBody = (await second.json()) as IssueResponse;
    expect(firstBody.issue.translationKeyId).toBe(translationKey.id);
    expect(firstBody.issue.key).toBe("home.cta");
    expect(firstBody.issue.sourceText).toBe("Save changes");
    expect(secondBody.issue.id).not.toBe(firstBody.issue.id);
    expect(secondBody.issue.translationKeyId).toBe(translationKey.id);

    const listResponse = await issueSheet().$get(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        query: { translationKeyId: translationKey.id, status: "all" },
      } as never,
      { headers: headers },
    );
    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as IssueSheetListResponse;
    expect(listBody.total).toBe(2);
    expect(listBody.issues.map((issue) => issue.id).sort()).toEqual(
      [firstBody.issue.id, secondBody.issue.id].sort(),
    );
  });

  it("links and unlinks an existing issue to a translation key", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const [translationKey] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        key: "nav.home",
        sourceText: "Home",
        normalizedSourceText: "Home",
      })
      .returning();

    const createResponse = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Standalone issue",
          issueType: "general_question",
        },
      } as never,
      { headers: headers },
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as IssueResponse;
    expect(created.issue.translationKeyId).toBeNull();

    const linkResponse = await issueSheet()[":issueId"].$patch(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
        json: {
          translationKeyId: translationKey.id,
          segmentId: translationKey.id,
          sourcePath: "messages/nav.json",
          targetLocale: "de-DE",
          linkKind: "content_editor_segment",
        },
      } as never,
      { headers: headers },
    );
    expect(linkResponse.status).toBe(200);
    const linked = (await linkResponse.json()) as IssueResponse;
    expect(linked.issue.translationKeyId).toBe(translationKey.id);
    expect(linked.issue.key).toBe("nav.home");

    const unlinkResponse = await issueSheet()[":issueId"].$patch(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
        json: { translationKeyId: null },
      } as never,
      { headers: headers },
    );
    expect(unlinkResponse.status).toBe(200);
    const unlinked = (await unlinkResponse.json()) as IssueResponse;
    expect(unlinked.issue.translationKeyId).toBeNull();
    expect(unlinked.issue.key).toBeNull();
  });

  it("rejects linking to a missing translation key and forbids member writes", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const ownerHeaders = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const missingKeyResponse = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Missing key",
          translationKeyId: crypto.randomUUID(),
        },
      } as never,
      { headers: ownerHeaders },
    );
    expect(missingKeyResponse.status).toBe(400);
    await expect(missingKeyResponse.json()).resolves.toMatchObject({
      error: "translation_key_not_found",
    });

    const member = projectFixture.createWorkosIdentityForOrganization(
      identity.organization,
      "member",
    );
    const memberHeaders = await projectFixture.authHeadersFor(member);
    await db.insert(schema.teamMemberships).values({
      teamId: project.teamId!,
      userId: await projectFixture.getLocalUserId(member.user.workosUserId),
      role: "member",
    });

    const forbiddenCreate = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: { title: "Member cannot create" },
      } as never,
      { headers: memberHeaders },
    );
    expect(forbiddenCreate.status).toBe(403);

    const allowedList = await issueSheet().$get(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        query: { status: "all" },
      } as never,
      { headers: memberHeaders },
    );
    expect(allowedList.status).toBe(200);
  });

  it("rejects create and link when the translation key belongs to another project", async () => {
    const { identity, organization, user, project } =
      await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const [otherProject] = await db
      .insert(schema.projects)
      .values({
        id: `project_${crypto.randomUUID()}`,
        organizationId: organization.id,
        teamId: project.teamId,
        createdByUserId: user.id,
        name: "Sibling Project",
        description: "",
        translationContext: "",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      })
      .returning();

    const [foreignKey] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: otherProject.id,
        key: "foreign.key",
        sourceText: "Foreign",
        normalizedSourceText: "Foreign",
      })
      .returning();

    const createResponse = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Cross-project key create",
          translationKeyId: foreignKey.id,
        },
      } as never,
      { headers: headers },
    );
    expect(createResponse.status).toBe(400);
    await expect(createResponse.json()).resolves.toMatchObject({
      error: "translation_key_not_found",
    });

    const standalone = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Standalone before bad link",
          issueType: "general_question",
        },
      } as never,
      { headers: headers },
    );
    expect(standalone.status).toBe(201);
    const created = (await standalone.json()) as IssueResponse;

    const linkResponse = await issueSheet()[":issueId"].$patch(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
        json: {
          translationKeyId: foreignKey.id,
          segmentId: foreignKey.id,
          linkKind: "content_editor_segment",
        },
      } as never,
      { headers: headers },
    );
    expect(linkResponse.status).toBe(400);
    await expect(linkResponse.json()).resolves.toMatchObject({
      error: "translation_key_not_found",
    });
  });

  it("creates a cat_segment issue for a file-backed segment without a translation key", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    // Image and office file segments carry a source file id, not a translation key id.
    const response = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Banner needs localized artwork",
          issueType: "context_request",
          targetLocale: "fr-FR",
          sourcePath: "assets/banner.png",
          segmentId: crypto.randomUUID(),
          linkKind: "content_editor_segment",
        },
      } as never,
      { headers: headers },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as IssueResponse;
    expect(body.issue.translationKeyId).toBeNull();
    expect(body.issue.linkKind).toBe("content_editor_segment");
  });

  it("keeps the issue when the linked translation key is deleted", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const [translationKey] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        key: "footer.legal",
        sourceText: "Legal",
        normalizedSourceText: "Legal",
      })
      .returning();

    const createResponse = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Legal copy issue",
          translationKeyId: translationKey.id,
          segmentId: translationKey.id,
          linkKind: "content_editor_segment",
          targetLocale: "fr-FR",
          sourcePath: "messages/footer.json",
        },
      } as never,
      { headers: headers },
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as IssueResponse;

    await db
      .delete(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.id, translationKey.id));

    const getResponse = await issueSheet()[":issueId"].$get(
      {
        param: {
          organizationSlug: organizationSlug,
          projectId: project.id,
          issueId: created.issue.id,
        },
      } as never,
      { headers: headers },
    );
    expect(getResponse.status).toBe(200);
    const body = (await getResponse.json()) as IssueResponse;
    expect(body.issue.id).toBe(created.issue.id);
    expect(body.issue.translationKeyId).toBeNull();
    expect(body.issue.key).toBeNull();
  });

  it("watches and unwatches an issue and reports isWatching on GET", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Watch me",
          issueType: "general_question",
        },
      } as never,
      { headers: headers },
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as IssueResponse;
    const issueId = created.issue.id;

    const initialGet = await issueSheet()[":issueId"].$get(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id, issueId: issueId },
      } as never,
      { headers: headers },
    );
    expect(initialGet.status).toBe(200);
    const initialBody = (await initialGet.json()) as IssueResponse;
    expect(initialBody.issue.isWatching).toBe(true);

    const unwatchResponse = await issueSheet()[":issueId"].subscription.$delete(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id, issueId: issueId },
      } as never,
      { headers: headers },
    );
    expect(unwatchResponse.status).toBe(204);

    const unwatchedGet = await issueSheet()[":issueId"].$get(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id, issueId: issueId },
      } as never,
      { headers: headers },
    );
    const unwatchedBody = (await unwatchedGet.json()) as IssueResponse;
    expect(unwatchedBody.issue.isWatching).toBe(false);

    const watchResponse = await issueSheet()[":issueId"].subscription.$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id, issueId: issueId },
      } as never,
      { headers: headers },
    );
    expect(watchResponse.status).toBe(201);
    await expect(watchResponse.json()).resolves.toMatchObject({
      subscription: {
        issueId,
        userId: expect.any(String),
      },
    });

    const watchedGet = await issueSheet()[":issueId"].$get(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id, issueId: issueId },
      } as never,
      { headers: headers },
    );
    const watchedBody = (await watchedGet.json()) as IssueResponse;
    expect(watchedBody.issue.isWatching).toBe(true);

    const duplicateWatch = await issueSheet()[":issueId"].subscription.$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id, issueId: issueId },
      } as never,
      { headers: headers },
    );
    expect(duplicateWatch.status).toBe(201);
  });

  it("lists issue subscribers", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Subscribers test",
          issueType: "general_question",
        },
      } as never,
      { headers: headers },
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as IssueResponse;
    const issueId = created.issue.id;

    const subscribersResponse = await issueSheet()[":issueId"].subscriptions.$get(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id, issueId: issueId },
      } as never,
      { headers: headers },
    );
    expect(subscribersResponse.status).toBe(200);
    const subscribersBody = (await subscribersResponse.json()) as {
      subscribers: { userId: string; displayName: string; avatarUrl: string | null }[];
    };
    expect(subscribersBody.subscribers).toHaveLength(1);
    expect(subscribersBody.subscribers[0]?.userId).toBeTruthy();
    expect(subscribersBody.subscribers[0]?.displayName).toBeTruthy();
  });

  it("manages the project issue template config, gated by project mutation permission for writes", async () => {
    const { identity, user, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const initialGet = await issueSheet()["template-config"].$get(
      { param: { organizationSlug: organizationSlug, projectId: project.id } } as never,
      { headers: headers },
    );
    expect(initialGet.status).toBe(200);
    const initialBody = (await initialGet.json()) as TemplateConfigResponse;
    expect(initialBody.templateConfig).toEqual({
      defaultTemplateKey: null,
      assigneeByTemplate: [],
    });

    // The fixture's owning identity is "admin", which has teams:write and is always assignable.
    const putResponse = await issueSheet()["template-config"].$put(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          defaultTemplateKey: "tpl_context_request",
          assigneeByTemplate: { tpl_qa_failure: user.id },
        },
      } as never,
      { headers: headers },
    );
    expect(putResponse.status).toBe(200);
    const putBody = (await putResponse.json()) as TemplateConfigResponse;
    expect(putBody.templateConfig).toEqual({
      defaultTemplateKey: "tpl_context_request",
      assigneeByTemplate: [{ templateKey: "tpl_qa_failure", userId: user.id, assignable: true }],
    });

    const invalidAssigneeResponse = await issueSheet()["template-config"].$put(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          defaultTemplateKey: null,
          assigneeByTemplate: { tpl_qa_failure: crypto.randomUUID() },
        },
      } as never,
      { headers: headers },
    );
    expect(invalidAssigneeResponse.status).toBe(400);
    await expect(invalidAssigneeResponse.json()).resolves.toMatchObject({
      error: "assignee_not_assignable",
    });

    const translatorIdentity = projectFixture.createWorkosIdentityForOrganization(
      identity.organization,
      "translator",
    );
    const translatorHeaders = await projectFixture.authHeadersFor(translatorIdentity);
    const translatorLocalId = await projectFixture.getLocalUserId(
      translatorIdentity.user.workosUserId,
    );
    // Team membership, not just an org role, is what grants project visibility (see
    // canAccessProject/getVisibleTeamIds in team-access.ts) — a translator with no team
    // membership on this project would correctly get 404, same as the "outsider" case
    // covered elsewhere in this file.
    await db.insert(schema.teamMemberships).values({
      teamId: project.teamId!,
      userId: translatorLocalId,
      role: "member",
    });

    const translatorGet = await issueSheet()["template-config"].$get(
      { param: { organizationSlug: organizationSlug, projectId: project.id } } as never,
      { headers: translatorHeaders },
    );
    expect(translatorGet.status).toBe(200);
    const translatorGetBody = (await translatorGet.json()) as TemplateConfigResponse;
    expect(translatorGetBody.templateConfig.defaultTemplateKey).toBe("tpl_context_request");

    const translatorPut = await issueSheet()["template-config"].$put(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: { defaultTemplateKey: null, assigneeByTemplate: {} },
      } as never,
      { headers: translatorHeaders },
    );
    expect(translatorPut.status).toBe(403);
  });

  it("records which template created an issue and preserves it through dedupe", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const created = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Template-created issue",
          issueType: "context_request",
          templateKey: "tpl_context_request",
          externalRef: "cat:template-dedupe:1",
          status: "open",
        },
      } as never,
      { headers: headers },
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as IssueResponse;
    expect(createdBody.issue.templateKey).toBe("tpl_context_request");

    // Same externalRef hits the open-issue dedupe path (createIssue -> findExistingLinkedIssue)
    // and must return the existing row untouched, including its original template_key, even
    // though this second request names a different template.
    const deduped = await issueSheet().$post(
      {
        param: { organizationSlug: organizationSlug, projectId: project.id },
        json: {
          title: "Template-created issue",
          issueType: "context_request",
          templateKey: "tpl_qa_failure",
          externalRef: "cat:template-dedupe:1",
          status: "open",
        },
      } as never,
      { headers: headers },
    );
    expect(deduped.status).toBe(201);
    const dedupedBody = (await deduped.json()) as IssueResponse;
    expect(dedupedBody.issue.id).toBe(createdBody.issue.id);
    expect(dedupedBody.issue.templateKey).toBe("tpl_context_request");
  });
});
