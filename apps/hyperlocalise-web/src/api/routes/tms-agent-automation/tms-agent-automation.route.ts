import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { badRequestResponse, forbiddenResponse } from "@/api/response.schema";
import {
  assertExternalTmsCredentialAdmin,
  getOrganizationExternalTmsProviderCredentialSummaryById,
} from "@/lib/providers/organization-external-tms-provider-credentials";
import {
  deleteTmsAgentAutomationSettingsForScope,
  getTmsAgentAutomationSettingsForScope,
  upsertTmsAgentAutomationSettingsForScope,
} from "@/lib/providers/agent-runs/tms-agent-automation-settings-store";

import { getOwnedProject, isProjectMutationAllowed } from "../project/project.shared";
import {
  projectAutomationParamsSchema,
  providerAutomationParamsSchema,
  upsertTmsAgentAutomationSettingsBodySchema,
} from "./tms-agent-automation.schema";

const validateUpsertBody = validator("json", (value, c) => {
  const parsed = upsertTmsAgentAutomationSettingsBodySchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_tms_agent_automation_settings_payload" }, 400);
  }
  return parsed.data;
});

const validateProjectParams = validator("param", (value, c) => {
  const parsed = projectAutomationParamsSchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_project_params" }, 400);
  }
  return parsed.data;
});

const validateProviderParams = validator("param", (value, c) => {
  const parsed = providerAutomationParamsSchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_provider_credential_params" }, 400);
  }
  return parsed.data;
});

async function resolveOwnedProviderCredential(
  organizationId: string,
  providerCredentialId: string,
) {
  return getOrganizationExternalTmsProviderCredentialSummaryById(
    organizationId,
    providerCredentialId,
  );
}

function mapSettingsError(c: Parameters<typeof badRequestResponse>[0], error: unknown) {
  if (error instanceof Error) {
    if (error.message === "auto_write_back_requires_manual_approval") {
      return badRequestResponse(
        c,
        "auto_write_back_requires_manual_approval",
        "Auto write-back requires manual proposal approval",
      );
    }
    if (error.message === "auto_draft_requires_locales") {
      return badRequestResponse(
        c,
        "auto_draft_requires_locales",
        "Auto-draft translations requires at least one locale",
      );
    }
  }

  throw error;
}

export function createTmsAgentAutomationRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/organization", async (c) => {
      const record = await getTmsAgentAutomationSettingsForScope({
        organizationId: c.var.auth.organization.localOrganizationId,
        scope: "organization",
      });

      return c.json({ tmsAgentAutomationSettings: record }, 200);
    })
    .put("/organization", validateUpsertBody, async (c) => {
      try {
        assertExternalTmsCredentialAdmin(c.var.auth.membership.role);
      } catch {
        return forbiddenResponse(c);
      }

      try {
        const payload = c.req.valid("json");
        const record = await upsertTmsAgentAutomationSettingsForScope({
          organizationId: c.var.auth.organization.localOrganizationId,
          scope: "organization",
          settings: payload.settings,
        });

        return c.json({ tmsAgentAutomationSettings: record }, 200);
      } catch (error) {
        return mapSettingsError(c, error);
      }
    })
    .delete("/organization", async (c) => {
      try {
        assertExternalTmsCredentialAdmin(c.var.auth.membership.role);
      } catch {
        return forbiddenResponse(c);
      }

      const record = await deleteTmsAgentAutomationSettingsForScope({
        organizationId: c.var.auth.organization.localOrganizationId,
        scope: "organization",
      });

      return c.json({ tmsAgentAutomationSettings: record }, 200);
    })
    .get("/projects/:projectId", validateProjectParams, async (c) => {
      const params = c.req.valid("param");
      const project = await getOwnedProject(c.var.auth, params.projectId);

      if (!project) {
        return c.json({ error: "project_not_found" }, 404);
      }

      const record = await getTmsAgentAutomationSettingsForScope({
        organizationId: c.var.auth.organization.localOrganizationId,
        scope: "project",
        projectId: project.id,
      });

      return c.json({ tmsAgentAutomationSettings: record }, 200);
    })
    .put("/projects/:projectId", validateProjectParams, validateUpsertBody, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const project = await getOwnedProject(c.var.auth, params.projectId);

      if (!project) {
        return c.json({ error: "project_not_found" }, 404);
      }

      try {
        const payload = c.req.valid("json");
        const record = await upsertTmsAgentAutomationSettingsForScope({
          organizationId: c.var.auth.organization.localOrganizationId,
          scope: "project",
          projectId: project.id,
          settings: payload.settings,
        });

        return c.json({ tmsAgentAutomationSettings: record }, 200);
      } catch (error) {
        return mapSettingsError(c, error);
      }
    })
    .delete("/projects/:projectId", validateProjectParams, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const project = await getOwnedProject(c.var.auth, params.projectId);

      if (!project) {
        return c.json({ error: "project_not_found" }, 404);
      }

      const record = await deleteTmsAgentAutomationSettingsForScope({
        organizationId: c.var.auth.organization.localOrganizationId,
        scope: "project",
        projectId: project.id,
      });

      return c.json({ tmsAgentAutomationSettings: record }, 200);
    })
    .get("/provider-credentials/:providerCredentialId", validateProviderParams, async (c) => {
      const params = c.req.valid("param");
      const organizationId = c.var.auth.organization.localOrganizationId;
      const providerCredential = await resolveOwnedProviderCredential(
        organizationId,
        params.providerCredentialId,
      );

      if (!providerCredential) {
        return c.json({ error: "provider_credential_not_found" }, 404);
      }

      const record = await getTmsAgentAutomationSettingsForScope({
        organizationId,
        scope: "provider",
        providerCredentialId: providerCredential.id,
      });

      return c.json({ tmsAgentAutomationSettings: record }, 200);
    })
    .put(
      "/provider-credentials/:providerCredentialId",
      validateProviderParams,
      validateUpsertBody,
      async (c) => {
        try {
          assertExternalTmsCredentialAdmin(c.var.auth.membership.role);
        } catch {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const organizationId = c.var.auth.organization.localOrganizationId;
        const providerCredential = await resolveOwnedProviderCredential(
          organizationId,
          params.providerCredentialId,
        );

        if (!providerCredential) {
          return c.json({ error: "provider_credential_not_found" }, 404);
        }

        try {
          const payload = c.req.valid("json");
          const record = await upsertTmsAgentAutomationSettingsForScope({
            organizationId,
            scope: "provider",
            providerCredentialId: providerCredential.id,
            settings: payload.settings,
          });

          return c.json({ tmsAgentAutomationSettings: record }, 200);
        } catch (error) {
          return mapSettingsError(c, error);
        }
      },
    )
    .delete("/provider-credentials/:providerCredentialId", validateProviderParams, async (c) => {
      try {
        assertExternalTmsCredentialAdmin(c.var.auth.membership.role);
      } catch {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const organizationId = c.var.auth.organization.localOrganizationId;
      const providerCredential = await resolveOwnedProviderCredential(
        organizationId,
        params.providerCredentialId,
      );

      if (!providerCredential) {
        return c.json({ error: "provider_credential_not_found" }, 404);
      }

      const record = await deleteTmsAgentAutomationSettingsForScope({
        organizationId,
        scope: "provider",
        providerCredentialId: providerCredential.id,
      });

      return c.json({ tmsAgentAutomationSettings: record }, 200);
    });
}
