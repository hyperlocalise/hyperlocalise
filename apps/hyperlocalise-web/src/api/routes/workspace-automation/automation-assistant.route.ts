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
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { rejectIfAiFeaturesUnavailable } from "@/api/billing/ai-features-response";
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  notFoundResponse,
} from "@/api/response.schema";
import { createAutomationAssistantTurnResponse } from "@/agents/automation-assistant/agent/channels/web";
import { canUseWorkspaceAutomationAssistant } from "@/lib/agents/workspace-automation-assistant-access";
import { workspaceAutomationEditorContextSchema } from "@/lib/agents/workspace-automation-editor-context";
import { isWorkspaceAutomationAssistantForm } from "@/lib/agents/workspace-automation-proposal-form";
import {
  beginAutomationAssistantTurn,
  bindAutomationAssistantSession,
  createAutomationAssistantSession,
  deleteAutomationAssistantSession,
  endAutomationAssistantTurn,
  findAutomationAssistantSessionForAutomation,
  getAutomationAssistantSession,
  listAutomationAssistantMessages,
  type AutomationAssistantMessage,
  type AutomationAssistantSession,
} from "@/lib/automation-assistant/sessions";
import { db, schema } from "@/lib/database/client";
import { resolveHyperlocaliseAgentLanguageModel } from "@/lib/providers/organization-language-model";

import {
  automationAssistantSessionParamsSchema,
  automationAssistantSessionQuerySchema,
  automationAssistantTurnBodySchema,
  automationAssistantTurnText,
  bindAutomationAssistantSessionBodySchema,
  createAutomationAssistantSessionBodySchema,
  type AutomationAssistantMessageResponse,
  type AutomationAssistantSessionResponse,
} from "./automation-assistant.schema";

const validateSessionParams = validator("param", (value, c) => {
  const parsed = automationAssistantSessionParamsSchema.safeParse(value);
  return parsed.success ? parsed.data : badRequestResponse(c, "invalid_session_id");
});

const validateSessionQuery = validator("query", (value, c) => {
  const parsed = automationAssistantSessionQuerySchema.safeParse(value);
  return parsed.success ? parsed.data : badRequestResponse(c, "invalid_automation_id");
});

const validateCreateBody = validator("json", (value, c) => {
  const parsed = createAutomationAssistantSessionBodySchema.safeParse(value);
  return parsed.success ? parsed.data : badRequestResponse(c, "invalid_body");
});

const validateBindBody = validator("json", (value, c) => {
  const parsed = bindAutomationAssistantSessionBodySchema.safeParse(value);
  return parsed.success ? parsed.data : badRequestResponse(c, "invalid_body");
});

const validateTurnBody = validator("json", (value, c) => {
  const parsed = automationAssistantTurnBodySchema.safeParse(value);
  return parsed.success ? parsed.data : badRequestResponse(c, "invalid_body");
});

function toSessionResponse(
  session: AutomationAssistantSession,
): AutomationAssistantSessionResponse {
  return {
    id: session.id,
    automationId: session.automationId,
    title: session.title,
    turnInProgress: session.assistantTurnStartedAt !== null,
    createdAt: session.createdAt.toISOString(),
    lastMessageAt: session.lastMessageAt.toISOString(),
  };
}

function toMessageResponse(
  message: AutomationAssistantMessage,
): AutomationAssistantMessageResponse {
  return {
    id: message.id,
    conversationId: message.sessionId,
    senderType: message.senderType,
    senderEmail: null,
    text: message.text,
    parts: message.parts,
    attachments: null,
    createdAt: message.createdAt.toISOString(),
  };
}

async function automationExists(organizationId: string, automationId: string) {
  const [automation] = await db
    .select({ id: schema.workspaceAutomations.id })
    .from(schema.workspaceAutomations)
    .where(
      and(
        eq(schema.workspaceAutomations.id, automationId),
        eq(schema.workspaceAutomations.organizationId, organizationId),
      ),
    )
    .limit(1);
  return automation !== undefined;
}

/**
 * The automation assistant's sessions: private to the person who opened them, bound to one
 * automation or to one unsaved draft, never listed in the Inbox. Operators only.
 */
export function createAutomationAssistantRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .use("*", async (c, next) => {
      if (!(await canUseWorkspaceAutomationAssistant(c.var.auth))) {
        return forbiddenResponse(c);
      }
      return next();
    })
    .post("/sessions", validateCreateBody, async (c) => {
      const body = c.req.valid("json");
      const organizationId = c.var.auth.organization.localOrganizationId;
      if (body.automationId && !(await automationExists(organizationId, body.automationId))) {
        return notFoundResponse(c, "automation_not_found");
      }
      const session = await createAutomationAssistantSession({
        organizationId,
        userId: c.var.auth.user.localUserId,
        automationId: body.automationId ?? null,
      });
      return c.json({ session: toSessionResponse(session) }, 201);
    })
    .get("/sessions", validateSessionQuery, async (c) => {
      const { automationId } = c.req.valid("query");
      const session = await findAutomationAssistantSessionForAutomation({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        automationId,
      });
      if (!session) {
        return c.json({ session: null, messages: [] }, 200);
      }
      const messages = await listAutomationAssistantMessages(session.id);
      return c.json(
        { session: toSessionResponse(session), messages: messages.map(toMessageResponse) },
        200,
      );
    })
    .get("/sessions/:sessionId", validateSessionParams, async (c) => {
      const { sessionId } = c.req.valid("param");
      const session = await getAutomationAssistantSession({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        sessionId,
      });
      if (!session) {
        return notFoundResponse(c, "session_not_found");
      }
      const messages = await listAutomationAssistantMessages(session.id);
      return c.json(
        { session: toSessionResponse(session), messages: messages.map(toMessageResponse) },
        200,
      );
    })
    .patch("/sessions/:sessionId", validateSessionParams, validateBindBody, async (c) => {
      const { sessionId } = c.req.valid("param");
      const { automationId } = c.req.valid("json");
      const organizationId = c.var.auth.organization.localOrganizationId;
      const session = await getAutomationAssistantSession({
        organizationId,
        userId: c.var.auth.user.localUserId,
        sessionId,
      });
      if (!session) {
        return notFoundResponse(c, "session_not_found");
      }
      if (session.automationId && session.automationId !== automationId) {
        return conflictResponse(c, "session_already_bound");
      }
      if (!(await automationExists(organizationId, automationId))) {
        return notFoundResponse(c, "automation_not_found");
      }
      await bindAutomationAssistantSession({ sessionId, automationId });
      return c.json({ session: toSessionResponse({ ...session, automationId }) }, 200);
    })
    .delete("/sessions/:sessionId", validateSessionParams, async (c) => {
      const { sessionId } = c.req.valid("param");
      const session = await getAutomationAssistantSession({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        sessionId,
      });
      if (!session) {
        return notFoundResponse(c, "session_not_found");
      }
      await deleteAutomationAssistantSession(session.id);
      return c.body(null, 204);
    })
    .post("/sessions/:sessionId/turns", validateSessionParams, validateTurnBody, async (c) => {
      const { sessionId } = c.req.valid("param");
      const body = c.req.valid("json");
      const organizationId = c.var.auth.organization.localOrganizationId;
      const session = await getAutomationAssistantSession({
        organizationId,
        userId: c.var.auth.user.localUserId,
        sessionId,
      });
      if (!session) {
        return notFoundResponse(c, "session_not_found");
      }
      const text = automationAssistantTurnText(body);
      if (!text) {
        return badRequestResponse(c, "empty_message");
      }
      const pageContext = workspaceAutomationEditorContextSchema.safeParse(body.pageContext);
      if (!pageContext.success || !isWorkspaceAutomationAssistantForm(pageContext.data.form)) {
        return badRequestResponse(c, "invalid_page_context");
      }
      if (session.automationId && pageContext.data.automationId !== session.automationId) {
        return badRequestResponse(c, "page_context_mismatch");
      }
      const aiFeaturesRejection = await rejectIfAiFeaturesUnavailable(c, organizationId);
      if (aiFeaturesRejection) {
        return aiFeaturesRejection;
      }
      if (!(await beginAutomationAssistantTurn(session.id))) {
        return conflictResponse(c, "turn_in_progress");
      }
      try {
        const languageModel = await resolveHyperlocaliseAgentLanguageModel({ organizationId });
        return createAutomationAssistantTurnResponse({
          session,
          organizationId,
          userEmail: c.var.auth.user.email,
          text,
          pageContext: pageContext.data,
          languageModel,
        });
      } catch (error) {
        await endAutomationAssistantTurn(session.id);
        throw error;
      }
    });
}
