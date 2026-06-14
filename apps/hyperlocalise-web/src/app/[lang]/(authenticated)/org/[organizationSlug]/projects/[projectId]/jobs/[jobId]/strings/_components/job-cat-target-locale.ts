export function selectJobCatTargetLocale({
  requestedTargetLocale,
  providerTargetLocales,
}: {
  requestedTargetLocale: string | null;
  providerTargetLocales: readonly string[];
}) {
  if (requestedTargetLocale && providerTargetLocales.includes(requestedTargetLocale)) {
    return requestedTargetLocale;
  }

  return providerTargetLocales[0] ?? null;
}
