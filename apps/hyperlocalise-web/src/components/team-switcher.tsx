export function buildOrganizationSwitchReturnTo(
  pathname: string,
  activeSlug: string,
  targetSlug: string,
) {
  if (pathname.startsWith(`/org/${activeSlug}`)) {
    return pathname.replace(`/org/${activeSlug}`, `/org/${targetSlug}`);
  }

  return `/org/${targetSlug}/dashboard`;
}

export function buildOrganizationSwitchHref(
  targetSlug: string,
  pathname: string,
  activeSlug: string,
) {
  const returnTo = buildOrganizationSwitchReturnTo(pathname, activeSlug, targetSlug);
  return `/auth/select-organization/${targetSlug}?returnTo=${encodeURIComponent(returnTo)}`;
}
