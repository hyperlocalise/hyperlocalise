export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export const E2E_DEFAULT_LOCALE = "en";

export function organizationDashboardPath(organizationSlug: string) {
  return `/${E2E_DEFAULT_LOCALE}/org/${organizationSlug}/dashboard`;
}

export function organizationProjectsPath(organizationSlug: string) {
  return `/${E2E_DEFAULT_LOCALE}/org/${organizationSlug}/projects`;
}
