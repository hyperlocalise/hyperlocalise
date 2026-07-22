/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
