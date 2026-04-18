import { cookies } from "next/headers";
import { z } from "zod";

export const onboardingStateCookieName = "hl_onboarding_state";

const onboardingStateSchema = z.object({
  organizationSlug: z.string().min(1),
  providerSetupStatus: z.enum(["pending", "configured", "skipped"]),
});

export type OnboardingState = z.infer<typeof onboardingStateSchema>;

export async function getStoredOnboardingState(): Promise<OnboardingState | null> {
  const rawValue = (await cookies()).get(onboardingStateCookieName)?.value;
  if (!rawValue) {
    return null;
  }

  try {
    return onboardingStateSchema.parse(JSON.parse(rawValue));
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
