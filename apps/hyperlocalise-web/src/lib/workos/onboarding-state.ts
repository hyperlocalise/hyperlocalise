import { cookies } from "next/headers";

export const onboardingStateCookieName = "hl_onboarding_state";

export type OnboardingState = {
  organizationSlug: string;
  providerSetupStatus: "pending" | "configured" | "skipped";
};

export async function getStoredOnboardingState(): Promise<OnboardingState | null> {
  const rawValue = (await cookies()).get(onboardingStateCookieName)?.value;
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as OnboardingState;
  } catch {
    return null;
  }
}

export async function setStoredOnboardingState(state: OnboardingState) {
  (await cookies()).set(onboardingStateCookieName, JSON.stringify(state), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60,
  });
}

export async function clearStoredOnboardingState() {
  (await cookies()).delete(onboardingStateCookieName);
}
