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
import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";

import type { ReportStep, ReportUnit, SummarySource } from "./report-units";
import type { MatchBucket } from "./word-analysis";

/**
 * Test data for Reports' read queries. Summary rows are written directly, so a test sets the
 * exact bands, units and days it reads back; how capture fills the summary is `summary.test.ts`.
 */

type Counts = number | Partial<Record<ReportUnit, number>>;

export type SummaryRowInput = {
  projectId?: string;
  jobId?: string | null;
  sourceLocale?: string;
  targetLocale: string;
  step?: ReportStep;
  bucket?: MatchBucket;
  payable?: boolean;
  day: string;
  source?: Counts;
  arrived?: Counts;
  arrivedDone?: Counts;
  /** Unfinished units held by no open task, which Progress leaves out. */
  abandoned?: Counts;
  finished?: Counts;
  finishedByPerson?: Counts;
  finishedUnchanged?: Counts;
  uncounted?: number;
  /** Where the finished text came from; "" for a row that only holds arrivals. */
  textSource?: SummarySource | "";
};

const UNITS: ReportUnit[] = ["words", "strings", "characters", "characters_with_spaces"];
const MEASURES = [
  "source",
  "arrived",
  "arrived_done",
  "abandoned",
  "finished",
  "finished_by_person",
  "finished_unchanged",
] as const;
const COLUMNS = [
  ...MEASURES.flatMap((measure) => UNITS.map((unit) => `${measure}_${unit}`)),
  "arrived_uncounted",
];
const CURRENT_COLUMNS = [
  ...UNITS.flatMap((unit) => [`arrived_${unit}`, `arrived_done_${unit}`]),
  "arrived_uncounted",
];

/** A count given as a number is words, with one string. */
function unitsOf(counts: Counts | undefined): Record<ReportUnit, number> {
  if (counts === undefined)
    return { words: 0, strings: 0, characters: 0, characters_with_spaces: 0 };
  if (typeof counts === "number")
    return { words: counts, strings: counts > 0 ? 1 : 0, characters: 0, characters_with_spaces: 0 };
  return {
    words: counts.words ?? 0,
    strings: counts.strings ?? 0,
    characters: counts.characters ?? 0,
    characters_with_spaces: counts.characters_with_spaces ?? 0,
  };
}

/**
 * Records when Reports started for a workspace, as its first capture does. Billing's rows count
 * in AI usage and AI spending only from then on, so tests that read them start Reports first;
 * the default is well before any day they use.
 */
export async function startReportingForTest(
  organizationId: string,
  at: Date = new Date("2026-01-01T00:00:00Z"),
) {
  await db
    .insert(schema.reportingWorkspaces)
    .values({ organizationId, startedAt: at })
    .onConflictDoUpdate({
      target: schema.reportingWorkspaces.organizationId,
      set: { startedAt: at },
    });
}

export function createReportingTestFixture() {
  const projectFixture = createProjectTestFixture();

  async function createWorkspace() {
    const stored = await projectFixture.createStoredProjectFixture();
    const { organization, user, project } = stored;

    const createProject = async (name: string, teamId = project.teamId) => {
      const [created] = await db
        .insert(schema.projects)
        .values({
          id: `project_${randomUUID()}`,
          identifier: uniqueTestProjectIdentifier(),
          organizationId: organization.id,
          teamId,
          createdByUserId: user.id,
          name,
          description: "",
          translationContext: "",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        })
        .returning();
      return created!;
    };

    const createJob = async (
      input: {
        projectId?: string;
        title?: string;
        status?: typeof schema.jobs.$inferInsert.status;
        assigned?: boolean;
        kind?: typeof schema.jobs.$inferInsert.kind;
        /** A task a visual workflow made for people, with the step it is for. */
        taskStep?: "translate" | "edit" | "proofread";
      } = {},
    ) => {
      const metadata = {
        ...(input.title ? { title: input.title } : {}),
        ...(input.taskStep ? { workflowTaskStep: input.taskStep } : {}),
      };
      const [job] = await db
        .insert(schema.jobs)
        .values({
          id: `job_${randomUUID()}`,
          organizationId: organization.id,
          projectId: input.projectId ?? project.id,
          createdByUserId: user.id,
          ownerUserId: input.assigned ? user.id : null,
          assigneeType: input.assigned ? "user" : "agent",
          kind:
            input.kind ??
            (input.taskStep && input.taskStep !== "translate" ? "proofread" : "translation"),
          status: input.status ?? "running",
          inputPayload: Object.keys(metadata).length ? { metadata } : {},
        })
        .returning();
      return job!;
    };

    /** Adds by-task summary rows and rebuilds the workspace's by-project rows from them. */
    const addSummary = async (rows: SummaryRowInput[]) => {
      for (const row of rows) {
        const values: Record<string, number> = { arrived_uncounted: row.uncounted ?? 0 };
        const given = {
          source: row.source,
          arrived: row.arrived,
          arrived_done: row.arrivedDone,
          abandoned: row.abandoned,
          finished: row.finished,
          finished_by_person: row.finishedByPerson,
          finished_unchanged: row.finishedUnchanged,
        };
        for (const measure of MEASURES) {
          const units = unitsOf(given[measure]);
          for (const unit of UNITS) values[`${measure}_${unit}`] = units[unit];
        }
        await db.execute(sql`
          insert into reporting_daily_by_task (organization_id, project_id, job_id, source_locale,
            target_locale, step, bucket, source, payable, day, ${sql.raw(COLUMNS.join(", "))})
          values (${organization.id}, ${row.projectId ?? project.id}, ${row.jobId ?? null},
            ${row.sourceLocale ?? "en-US"}, ${row.targetLocale}, ${row.step ?? "translation"},
            ${row.bucket ?? "new"}, ${row.textSource ?? ""}, ${row.payable ?? false}, ${row.day},
            ${sql.join(
              COLUMNS.map((column) => sql`${values[column]}`),
              sql`, `,
            )})
        `);
      }
      await db
        .delete(schema.reportingDailyByProject)
        .where(eq(schema.reportingDailyByProject.organizationId, organization.id));
      await db.execute(sql`
        insert into reporting_daily_by_project (organization_id, project_id, target_locale, step,
          bucket, source, day, ${sql.raw(COLUMNS.join(", "))})
        select organization_id, project_id, target_locale, step, bucket, source, day,
          ${sql.raw(COLUMNS.map((column) => `sum(${column})`).join(", "))}
        from reporting_daily_by_task where organization_id = ${organization.id}
        group by 1, 2, 3, 4, 5, 6, 7
      `);
      await db
        .delete(schema.reportingCurrentByProject)
        .where(eq(schema.reportingCurrentByProject.organizationId, organization.id));
      await db.execute(sql`
        insert into reporting_current_by_project (organization_id, project_id, source_locale,
          target_locale, step, bucket, ${sql.raw(CURRENT_COLUMNS.join(", "))})
        select s.organization_id, s.project_id, coalesce(p.source_locale, 'en'), s.target_locale,
          s.step, s.bucket, ${sql.raw(CURRENT_COLUMNS.map((column) => `sum(s.${column})`).join(", "))}
        from reporting_daily_by_project s join projects p on p.id = s.project_id
        where s.organization_id = ${organization.id}
        group by 1, 2, 3, 4, 5, 6
      `);
    };

    return { ...stored, createProject, createJob, addSummary };
  }

  return {
    createWorkspace,
    cleanup: projectFixture.cleanup,
    authHeadersFor: projectFixture.authHeadersFor,
    createWorkosIdentityForOrganization: projectFixture.createWorkosIdentityForOrganization,
    createLocalWorkosIdentity: projectFixture.createLocalWorkosIdentity,
  };
}
