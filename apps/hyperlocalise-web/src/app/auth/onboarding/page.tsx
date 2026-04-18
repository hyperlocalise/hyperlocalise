import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/app/auth/onboarding/_components/onboarding-wizard";
import { loadOnboardingContext } from "@/lib/onboarding/context";
import { getOrganizationProviderCredentialSummary } from "@/lib/providers/organization-provider-credentials";

type Step = "create" | "provider" | "ready";

function normalizeStep(value: string | string[] | undefined): Step | null {
  const step = Array.isArray(value) ? value[0] : value;
  if (step === "create" || step === "provider" || step === "ready") {
    return step;
  }

  return null;
}

function getDashboardPath(slug: string | null | undefined) {
  if (!slug) {
    return "/auth/access-denied?reason=missing-org-slug";
  }

  return `/org/${slug}/dashboard`;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const requestedStep = normalizeStep(params.step);
  const { onboardingState, auth } = await loadOnboardingContext();

  if (!onboardingState) {
    if (auth) {
      redirect(getDashboardPath(auth.activeOrganization.slug));
    }

    return <OnboardingWizard step="create" />;
  }

  if (!auth || auth.activeOrganization.slug !== onboardingState.organizationSlug) {
    redirect("/auth/onboarding");
  }

  const providerSummary = await getOrganizationProviderCredentialSummary(
    auth.activeOrganization.localOrganizationId,
  );
  const maximumStep = providerSummary || onboardingState.providerSetupStatus !== "pending" ? 2 : 1;
  const stepOrder: Step[] = ["create", "provider", "ready"];
  const requestedStepIndex =
    requestedStep === null ? maximumStep : stepOrder.findIndex((step) => step === requestedStep);
  const safeStep = stepOrder[Math.min(requestedStepIndex, maximumStep)] ?? stepOrder[maximumStep];

  if (!requestedStep || requestedStepIndex > maximumStep) {
    redirect(`/auth/onboarding?step=${safeStep}`);
  }

  return (
    <OnboardingWizard
      step={safeStep}
      organizationName={auth.activeOrganization.name}
      organizationSlug={auth.activeOrganization.slug}
      providerSummary={
        providerSummary
          ? {
              provider: providerSummary.provider,
              defaultModel: providerSummary.defaultModel,
              maskedApiKeySuffix: providerSummary.maskedApiKeySuffix,
            }
          : null
      }
      providerSetupStatus={onboardingState.providerSetupStatus}
    />
  );
}
