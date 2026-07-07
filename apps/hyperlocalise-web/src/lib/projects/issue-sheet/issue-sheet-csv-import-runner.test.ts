import "dotenv/config";

import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import type { IssueSheetImportBody } from "@/api/routes/project/issue-sheet.schema";
import { db, schema } from "@/lib/database";

import { runIssueSheetCsvImport } from "./issue-sheet-csv-import-runner";
import { IssueSheetService } from "./issue-sheet-service";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

function systemMapping(csvHeader: string, field: IssueSheetImportBody["mapping"][number]["target"]) {
  return { csvHeader, target: field };
}

async function countImportedIssues(organizationId: string, projectId: string) {
  const rows = await db
    .select({ id: schema.issueSheetIssues.id })
    .from(schema.issueSheetIssues)
    .where(
      and(
        eq(schema.issueSheetIssues.organizationId, organizationId),
        eq(schema.issueSheetIssues.projectId, projectId),
      ),
    );

  return rows.length;
}

describe("runIssueSheetCsvImport", () => {
  it("stops at the first invalid row when skipInvalidRows is disabled", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();
    const service = new IssueSheetService();

    const result = await runIssueSheetCsvImport(service, {
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      body: {
        content: `Title,Status,External ID
Broken row,Definitely not a status,EXT-1
Valid row,Open,EXT-2`,
        dryRun: false,
        mapping: [
          systemMapping("Title", { kind: "system", field: "title" }),
          systemMapping("Status", { kind: "system", field: "status" }),
          systemMapping("External ID", { kind: "system", field: "external_ref" }),
        ],
        options: { skipInvalidRows: false },
      },
    });

    expect(result).toMatchObject({
      totalRows: 2,
      created: 0,
      skippedInvalid: 1,
      errors: [{ row: 2, message: "Unknown status: Definitely not a status" }],
    });
    await expect(countImportedIssues(organization.id, project.id)).resolves.toBe(0);
  });

  it("skips duplicate external references within the same csv import", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();
    const service = new IssueSheetService();

    const result = await runIssueSheetCsvImport(service, {
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      body: {
        content: `Title,Status,External ID
First copy issue,Open,EXT-DUP
Second copy issue,Open,EXT-DUP`,
        dryRun: false,
        mapping: [
          systemMapping("Title", { kind: "system", field: "title" }),
          systemMapping("Status", { kind: "system", field: "status" }),
          systemMapping("External ID", { kind: "system", field: "external_ref" }),
        ],
      },
    });

    expect(result).toMatchObject({
      totalRows: 2,
      created: 1,
      skippedDuplicates: 1,
      skippedInvalid: 0,
    });

    const issues = await db
      .select({
        title: schema.issueSheetIssues.title,
        externalRef: schema.issueSheetIssues.externalRef,
      })
      .from(schema.issueSheetIssues)
      .where(
        and(
          eq(schema.issueSheetIssues.organizationId, organization.id),
          eq(schema.issueSheetIssues.projectId, project.id),
        ),
      );

    expect(issues).toEqual([{ title: "First copy issue", externalRef: "EXT-DUP" }]);
  });

  it("persists created select columns, row values, and assignee resolution", async () => {
    const { identity, organization, project, user } =
      await projectFixture.createStoredProjectFixture();
    const assigneeIdentity = projectFixture.createWorkosIdentityForOrganization(
      identity.organization,
      "member",
    );
    const { user: assigneeUser } = await projectFixture.createLocalWorkosIdentity(assigneeIdentity);
    const service = new IssueSheetService();

    const result = await runIssueSheetCsvImport(service, {
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      body: {
        content: `Title,Assignee,Severity
Fix context,${assigneeIdentity.user.email},High
Check copy,missing-assignee@example.com,Low`,
        dryRun: false,
        mapping: [
          systemMapping("Title", { kind: "system", field: "title" }),
          systemMapping("Assignee", { kind: "system", field: "assignee" }),
          {
            csvHeader: "Severity",
            target: { kind: "create", key: "imported_severity", label: "Imported Severity", type: "select" },
          },
        ],
      },
    });

    expect(result).toMatchObject({
      totalRows: 2,
      created: 2,
      columnsCreated: [{ key: "imported_severity", label: "Imported Severity" }],
      warnings: [
        {
          row: 0,
          message: "No External ID column mapped — re-importing the same file may create duplicates",
        },
        {
          row: 3,
          message: 'Assignee "missing-assignee@example.com" was not found in the organization',
        },
      ],
    });

    const columns = await service.listColumns({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
    });
    const severityColumn = columns.find((column) => column.key === "imported_severity");
    expect(severityColumn).toMatchObject({
      label: "Imported Severity",
      type: "select",
      config: {
        options: [
          { id: "High", label: "High" },
          { id: "Low", label: "Low" },
        ],
      },
    });

    const issues = await service.listIssues({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      query: { status: "all", limit: 10, offset: 0 },
    });

    const assignedIssue = issues.issues.find((issue) => issue.title === "Fix context");
    const unassignedIssue = issues.issues.find((issue) => issue.title === "Check copy");
    expect(assignedIssue).toMatchObject({
      assigneeUserId: assigneeUser.id,
      values: { imported_severity: "High" },
    });
    expect(unassignedIssue).toMatchObject({
      assigneeUserId: null,
      values: { imported_severity: "Low" },
    });
  });
});
