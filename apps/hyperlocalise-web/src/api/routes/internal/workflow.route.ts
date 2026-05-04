import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";

import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import type { FileStorageAdapter } from "@/lib/file-storage";
import { createStoredFile } from "@/lib/file-storage/records";
import { bufferFromStream } from "@/lib/streams";
import type { StringTranslationJobResult } from "@/lib/translation/string-job-executor";
import {
  claimTranslationJob,
  completeTranslationJob,
  executeClaimedTranslationJob,
  failTranslationJob,
} from "@/lib/translation/translation-job-queued-function";
import type { TranslationJobQueuedEventData } from "@/lib/workflow/types";

type CreateInternalWorkflowRoutesOptions = {
  fileStorageAdapter?: FileStorageAdapter;
};

function badRequestResponse(c: { json(body: { error: string }, status: 400): Response }) {
  return c.json({ error: "bad_request" }, 400);
}

function notFoundResponse(c: { json(body: { error: string }, status: 404): Response }) {
  return c.json({ error: "not_found" }, 404);
}

const internalMiddleware = createMiddleware(async (c, next) => {
  const secret = env.WORKFLOW_INTERNAL_SECRET;
  if (!secret || c.req.header("x-internal-secret") !== secret) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

export function createInternalWorkflowRoutes(options: CreateInternalWorkflowRoutesOptions = {}) {
  return new Hono()
    .use("*", internalMiddleware)
    .post("/translation-jobs/claim", async (c) => {
      const body = (await c.req.json()) as { event: TranslationJobQueuedEventData; runId: string };
      if (!body?.event || !body?.runId) {
        return badRequestResponse(c);
      }
      const result = await claimTranslationJob({ event: body.event, runId: body.runId });
      return c.json({ result }, 200);
    })
    .post("/translation-jobs/execute-string", async (c) => {
      const body = (await c.req.json()) as {
        job: {
          id: string;
          projectId: string;
          type: "string" | "file";
          inputPayload: unknown;
          workflowRunId: string;
        };
      };
      if (!body?.job) {
        return badRequestResponse(c);
      }
      const result = await executeClaimedTranslationJob(body.job);
      return c.json({ result }, 200);
    })
    .post("/translation-jobs/complete", async (c) => {
      const body = (await c.req.json()) as {
        jobId: string;
        projectId: string;
        workflowRunId: string;
        result: StringTranslationJobResult;
      };
      if (!body?.jobId || !body?.projectId || !body?.workflowRunId) {
        return badRequestResponse(c);
      }
      const job = await completeTranslationJob(body);
      return c.json({ job }, 200);
    })
    .post("/translation-jobs/fail", async (c) => {
      const body = (await c.req.json()) as {
        jobId: string;
        projectId: string;
        workflowRunId: string;
        code: string;
        message: string;
      };
      if (!body?.jobId || !body?.projectId || !body?.workflowRunId) {
        return badRequestResponse(c);
      }
      const job = await failTranslationJob(body);
      return c.json({ job }, 200);
    })
    .post("/email-translation-jobs/:jobId/mark-running", async (c) => {
      const jobId = c.req.param("jobId");
      const body = (await c.req.json()) as { workflowRunId: string };
      if (!body?.workflowRunId) {
        return badRequestResponse(c);
      }
      await db
        .update(schema.jobs)
        .set({
          status: "running",
          workflowRunId: body.workflowRunId,
          lastError: null,
          outcomePayload: null,
          completedAt: null,
        })
        .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.kind, "translation")));
      return c.json({ success: true }, 200);
    })
    .post("/email-translation-jobs/:jobId/succeed", async (c) => {
      const jobId = c.req.param("jobId");
      const body = (await c.req.json()) as {
        attachment: { filename: string };
        outputFilename: string;
        targetLocale: string;
      };
      if (!body?.attachment || !body?.outputFilename || !body?.targetLocale) {
        return badRequestResponse(c);
      }
      await db.transaction(async (tx) => {
        await tx
          .update(schema.jobs)
          .set({
            status: "succeeded",
            outcomePayload: {
              kind: "email_file_result",
              sourceFilename: body.attachment.filename,
              outputFilename: body.outputFilename,
              targetLocale: body.targetLocale,
            },
            lastError: null,
            completedAt: new Date(),
          })
          .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.kind, "translation")));
        await tx
          .update(schema.translationJobDetails)
          .set({ outcomeKind: "file_result" })
          .where(eq(schema.translationJobDetails.jobId, jobId));
      });
      return c.json({ success: true }, 200);
    })
    .post("/email-translation-jobs/:jobId/fail", async (c) => {
      const jobId = c.req.param("jobId");
      const body = (await c.req.json()) as { reason: string };
      if (!body?.reason) {
        return badRequestResponse(c);
      }
      await db.transaction(async (tx) => {
        await tx
          .update(schema.jobs)
          .set({
            status: "failed",
            outcomePayload: {
              kind: "email_file_error",
              message: body.reason,
            },
            lastError: body.reason,
            completedAt: new Date(),
          })
          .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.kind, "translation")));
        await tx
          .update(schema.translationJobDetails)
          .set({ outcomeKind: "error" })
          .where(eq(schema.translationJobDetails.jobId, jobId));
      });
      return c.json({ success: true }, 200);
    })
    .get("/projects/:projectId/organization", async (c) => {
      const projectId = c.req.param("projectId");
      const [project] = await db
        .select({ organizationId: schema.projects.organizationId })
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .limit(1);
      if (!project) {
        return notFoundResponse(c);
      }
      return c.json({ organizationId: project.organizationId }, 200);
    })
    .get("/stored-files/:fileId", async (c) => {
      const fileId = c.req.param("fileId");
      const organizationId = c.req.query("organizationId");
      if (!organizationId) {
        return badRequestResponse(c);
      }
      const [file] = await db
        .select()
        .from(schema.storedFiles)
        .where(
          and(
            eq(schema.storedFiles.id, fileId),
            eq(schema.storedFiles.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (!file) {
        return notFoundResponse(c);
      }
      return c.json({ file }, 200);
    })
    .get("/stored-files/:fileId/content", async (c) => {
      const fileId = c.req.param("fileId");
      const organizationId = c.req.query("organizationId");
      if (!organizationId) {
        return badRequestResponse(c);
      }
      const [file] = await db
        .select()
        .from(schema.storedFiles)
        .where(
          and(
            eq(schema.storedFiles.id, fileId),
            eq(schema.storedFiles.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (!file) {
        return notFoundResponse(c);
      }

      const adapter = options.fileStorageAdapter;
      const storedObject = await (adapter
        ? adapter.get({ keyOrUrl: file.storageKey })
        : import("@/lib/file-storage").then(({ getFileStorageAdapter }) =>
            getFileStorageAdapter().get({ keyOrUrl: file.storageKey }),
          ));

      if (!storedObject) {
        return notFoundResponse(c);
      }

      const content = await bufferFromStream(storedObject.body);
      return c.json(
        {
          file,
          contentBase64: content.toString("base64"),
        },
        200,
      );
    })
    .post("/stored-files", async (c) => {
      const body = (await c.req.json()) as {
        organizationId: string;
        projectId: string;
        jobId: string;
        filename: string;
        contentType: string;
        contentBase64: string;
      };
      if (
        !body?.organizationId ||
        !body?.projectId ||
        !body?.jobId ||
        !body?.filename ||
        !body?.contentType ||
        typeof body.contentBase64 !== "string"
      ) {
        return badRequestResponse(c);
      }

      const file = await createStoredFile({
        organizationId: body.organizationId,
        projectId: body.projectId,
        role: "output",
        sourceKind: "job_output",
        sourceJobId: body.jobId,
        filename: body.filename,
        contentType: body.contentType,
        content: Buffer.from(body.contentBase64, "base64"),
        adapter: options.fileStorageAdapter,
      });

      return c.json({ file }, 200);
    })
    .post("/file-translation-jobs/complete", async (c) => {
      const body = (await c.req.json()) as {
        jobId: string;
        projectId: string;
        workflowRunId: string;
        outputFiles: Array<{ fileId: string; locale: string; filename: string }>;
      };
      if (!body?.jobId || !body?.projectId || !body?.workflowRunId) {
        return badRequestResponse(c);
      }
      const didSucceed = await db.transaction(async (tx) => {
        const [updatedJob] = await tx
          .update(schema.jobs)
          .set({
            status: "succeeded",
            outcomePayload: {
              outputFiles: body.outputFiles,
            },
            lastError: null,
            completedAt: new Date(),
          })
          .where(
            and(
              eq(schema.jobs.kind, "translation"),
              eq(schema.jobs.id, body.jobId),
              eq(schema.jobs.projectId, body.projectId),
              eq(schema.jobs.workflowRunId, body.workflowRunId),
            ),
          )
          .returning({ id: schema.jobs.id });
        if (!updatedJob) {
          return false;
        }
        await tx
          .update(schema.translationJobDetails)
          .set({ outcomeKind: "file_result" })
          .where(eq(schema.translationJobDetails.jobId, body.jobId));
        return true;
      });
      if (!didSucceed) {
        return c.json({ error: "job_not_found_or_not_owned" }, 409);
      }
      return c.json({ success: true }, 200);
    });
}
