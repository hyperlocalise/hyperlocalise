"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { updateProviderCredentialBodySchema } from "@/api/routes/provider-credential/provider-credential.schema";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";
import { isFixtureAuthEnabled } from "@/lib/e2e/config";
import { attachOrganizationToFixtureSession } from "@/lib/e2e/fixture-auth";
import { createWorkspaceForSessionUser } from "@/lib/onboarding/workspace";
import { loadOnboardingContext } from "@/lib/onboarding/context";
import {
  assertProviderCredentialAdmin,
  getOrganizationProviderCredentialSummary,
  upsertOrganizationProviderCredential,
} from "@/lib/providers/credentials/organization-provider-credentials";
import { setStoredActiveOrganizationSlug } from "@/lib/workos/active-organization";
import {
  clearStoredOnboardingState,
  setStoredOnboardingState,
} from "@/lib/workos/onboarding-state";

export type CreateWorkspaceActionState = {
  error?: string;
  fieldErrors?: {
    organizationName?: string;
  };
};

export type SaveProviderActionState = {
  error?: string;
  fieldErrors?: {
    provider?: string;
    apiKey?: string;
    defaultModel?: string;
  };
};

const createWorkspaceSchema = z.object({
  organizationName: z.string().trim().min(2),
});

function getOrganizationDashboardPath(slug: string | null | undefined) {
  if (!slug) {
    return "/auth/access-denied?reason=missing-org-slug";
  }

  return `/org/${slug}/dashboard`;
}

export async function createWorkspaceAction(
  _previousState: CreateWorkspaceActionState,
  formData: FormData,
): Promise<CreateWorkspaceActionState> {
  const intl = getIntlShape(await getAppLocale());
  const parsed = createWorkspaceSchema.safeParse({
    organizationName: formData.get("organizationName"),
  });

  if (!parsed.success) {
    const hasOrganizationNameError =
      parsed.error.flatten().fieldErrors.organizationName !== undefined;

    return {
      fieldErrors: {
        organizationName: hasOrganizationNameError
          ? intl.formatMessage({
              defaultMessage: "Workspace name must be at least 2 characters.",
              id: "9aWpVkf/JD",
              description: "Validation error when the workspace name is too short",
            })
          : undefined,
      },
    };
  }

  const { session, onboardingState, auth } = await loadOnboardingContext();

  if (onboardingState?.organizationSlug || auth?.activeOrganization.slug) {
    redirect(
      getOrganizationDashboardPath(
        auth?.activeOrganization.slug ?? onboardingState?.organizationSlug,
      ),
    );
  }

  if (!session.user) {
    redirect("/auth/sign-in?returnTo=/auth/onboarding");
  }

  let organization;
  let user;
  let workosMembershipId: string;
  let workosOrganizationId: string;

  try {
    ({ organization, user, workosMembershipId, workosOrganizationId } =
      await createWorkspaceForSessionUser({
        sessionUser: session.user,
        organizationName: parsed.data.organizationName,
      }));
  } catch (error) {
    if (error instanceof Error && error.message === "workspace_slug_conflict") {
      return {
        error: intl.formatMessage({
          defaultMessage: "Unable to create a unique workspace URL right now. Please retry.",
          id: "NIwDVdLvI2",
          description: "Error when workspace slug generation conflicts during onboarding",
        }),
      };
    }

    if (error instanceof Error && error.message === "workos_organization_required") {
      return {
        error: intl.formatMessage({
          defaultMessage:
            "Workspace creation requires WorkOS organization management to be configured.",
          id: "7itDAFKmls",
          description: "Error when WorkOS organization management is not configured",
        }),
      };
    }

    throw error;
  }

  if (!organization.slug) {
    return {
      error: intl.formatMessage({
        defaultMessage: "We created the workspace, but could not prepare its URL. Please retry.",
        id: "xX2Nm+qioI",
        description: "Error when workspace was created without a usable slug",
      }),
    };
  }

  if (isFixtureAuthEnabled()) {
    const sessionToken = (await cookies()).get("wos-session")?.value;
    if (sessionToken) {
      await attachOrganizationToFixtureSession({
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          workosOrganizationId,
        },
        sessionToken,
        user: {
          email: user.email,
          id: user.id,
          workosUserId: user.workosUserId,
        },
        workosMembershipId,
      });
    }
  }

  await setStoredActiveOrganizationSlug(organization.slug);
  await clearStoredOnboardingState();

  redirect(getOrganizationDashboardPath(organization.slug));
}

export async function saveProviderCredentialAction(
  _previousState: SaveProviderActionState,
  formData: FormData,
): Promise<SaveProviderActionState> {
  const intl = getIntlShape(await getAppLocale());
  const parsed = updateProviderCredentialBodySchema.safeParse({
    provider: formData.get("provider"),
    apiKey: formData.get("apiKey"),
    defaultModel: formData.get("defaultModel"),
  });

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    let defaultModelError: string | undefined;

    if (flattened.defaultModel?.[0]) {
      const defaultModelIssue = parsed.error.issues.find(
        (issue) => issue.path[0] === "defaultModel",
      );
      defaultModelError =
        defaultModelIssue?.code === "too_small"
          ? intl.formatMessage({
              defaultMessage: "Default model is required.",
              id: "e6YBGi9Md6",
              description: "Validation error when default model is missing during onboarding",
            })
          : intl.formatMessage({
              defaultMessage: "Choose a supported model for the selected provider.",
              id: "TYuiCQUYlI",
              description: "Validation error when default model is unsupported during onboarding",
            });
    }

    return {
      fieldErrors: {
        provider: flattened.provider?.[0]
          ? intl.formatMessage({
              defaultMessage: "Select a supported provider.",
              id: "mi29vosn6Y",
              description: "Validation error when onboarding provider selection is invalid",
            })
          : undefined,
        apiKey: flattened.apiKey?.[0]
          ? intl.formatMessage({
              defaultMessage: "API key is required.",
              id: "2kWEZewISl",
              description: "Validation error when provider API key is missing during onboarding",
            })
          : undefined,
        defaultModel: defaultModelError,
      },
    };
  }

  const { onboardingState, auth } = await loadOnboardingContext();

  if (!onboardingState?.organizationSlug || !auth) {
    redirect("/auth/onboarding");
  }

  try {
    assertProviderCredentialAdmin(auth.membership.role);
    await upsertOrganizationProviderCredential({
      organizationId: auth.activeOrganization.localOrganizationId,
      userId: auth.user.localUserId,
      provider: parsed.data.provider,
      apiKey: parsed.data.apiKey,
      defaultModel: parsed.data.defaultModel,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : intl.formatMessage({
            defaultMessage: "Unable to validate the credential.",
            id: "fj5dhgmhYc",
            description:
              "Generic error when provider credential validation fails during onboarding",
          });

    return {
      error:
        message === "forbidden"
          ? intl.formatMessage({
              defaultMessage: "You do not have permission to update provider credentials.",
              id: "tZ+plgRfNJ",
              description:
                "Error when the user lacks permission to save provider credentials during onboarding",
            })
          : message,
    };
  }

  await setStoredOnboardingState({
    organizationSlug: onboardingState.organizationSlug,
    providerSetupStatus: "configured",
  });

  redirect("/auth/onboarding?step=ready");
}

export async function skipProviderCredentialAction() {
  const { onboardingState, auth } = await loadOnboardingContext();

  if (!onboardingState?.organizationSlug || !auth) {
    redirect("/auth/onboarding");
  }

  await setStoredOnboardingState({
    organizationSlug: onboardingState.organizationSlug,
    providerSetupStatus: "skipped",
  });

  redirect("/auth/onboarding?step=ready");
}

export async function finishOnboardingAction() {
  const { onboardingState, auth } = await loadOnboardingContext();

  if (!auth) {
    redirect("/auth/onboarding");
  }

  if (onboardingState?.providerSetupStatus === "pending") {
    const providerCredential = await getOrganizationProviderCredentialSummary(
      auth.activeOrganization.localOrganizationId,
    );

    if (!providerCredential) {
      redirect("/auth/onboarding?step=provider");
    }
  }

  await clearStoredOnboardingState();
  redirect(getOrganizationDashboardPath(auth.activeOrganization.slug));
}
