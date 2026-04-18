"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { updateProviderCredentialBodySchema } from "@/api/routes/provider-credential/provider-credential.schema";
import { createWorkspaceForSessionUser } from "@/lib/onboarding/workspace";
import { loadOnboardingContext } from "@/lib/onboarding/context";
import {
  getOrganizationProviderCredentialSummary,
  upsertOrganizationProviderCredential,
} from "@/lib/providers/organization-provider-credentials";
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
  organizationName: z.string().trim().min(2, "Workspace name must be at least 2 characters."),
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
  const parsed = createWorkspaceSchema.safeParse({
    organizationName: formData.get("organizationName"),
  });

  if (!parsed.success) {
    const issue = parsed.error.flatten().fieldErrors.organizationName?.[0];
    return {
      fieldErrors: {
        organizationName: issue,
      },
    };
  }

  const { session, onboardingState, auth } = await loadOnboardingContext();

  if (onboardingState?.organizationSlug) {
    redirect("/auth/onboarding?step=provider");
  }

  if (auth?.activeOrganization.slug) {
    redirect(getOrganizationDashboardPath(auth.activeOrganization.slug));
  }

  if (!session.user) {
    redirect("/auth/sign-in?returnTo=/auth/onboarding");
  }

  const { organization } = await createWorkspaceForSessionUser({
    sessionUser: session.user,
    organizationName: parsed.data.organizationName,
  });

  if (!organization.slug) {
    return {
      error: "We created the workspace, but could not prepare its URL. Please retry.",
    };
  }

  await setStoredActiveOrganizationSlug(organization.slug);
  await setStoredOnboardingState({
    organizationSlug: organization.slug,
    providerSetupStatus: "pending",
  });

  redirect("/auth/onboarding?step=provider");
}

export async function saveProviderCredentialAction(
  _previousState: SaveProviderActionState,
  formData: FormData,
): Promise<SaveProviderActionState> {
  const parsed = updateProviderCredentialBodySchema.safeParse({
    provider: formData.get("provider"),
    apiKey: formData.get("apiKey"),
    defaultModel: formData.get("defaultModel"),
  });

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;

    return {
      fieldErrors: {
        provider: flattened.provider?.[0],
        apiKey: flattened.apiKey?.[0],
        defaultModel: flattened.defaultModel?.[0],
      },
    };
  }

  const { onboardingState, auth } = await loadOnboardingContext();

  if (!onboardingState?.organizationSlug || !auth) {
    redirect("/auth/onboarding");
  }

  try {
    await upsertOrganizationProviderCredential({
      organizationId: auth.activeOrganization.localOrganizationId,
      userId: auth.user.localUserId,
      provider: parsed.data.provider,
      apiKey: parsed.data.apiKey,
      defaultModel: parsed.data.defaultModel,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to validate the credential.";

    return {
      error: message,
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
