import { cookies } from "next/headers";

export const activeOrganizationCookieName = "hl_active_org_slug";

export async function getStoredActiveOrganizationSlug() {
  return (await cookies()).get(activeOrganizationCookieName)?.value ?? null;
}

export async function setStoredActiveOrganizationSlug(slug: string) {
  (await cookies()).set(activeOrganizationCookieName, slug, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
