export type CrowdinTaskLocaleSource = {
  languageId?: string | null;
  sourceLanguageId?: string | null;
  targetLanguageId?: string | null;
  targetLanguages?: Array<{ id?: string | null }> | null;
};

export function extractCrowdinTaskTargetLocales(task: CrowdinTaskLocaleSource): string[] {
  const fromTargetLanguages = (task.targetLanguages ?? [])
    .map((language) => language.id)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);

  if (fromTargetLanguages.length > 0) {
    return [...new Set(fromTargetLanguages)];
  }

  if (task.targetLanguageId?.trim()) {
    return [task.targetLanguageId];
  }

  if (task.languageId?.trim()) {
    return [task.languageId];
  }

  return [];
}

export function extractCrowdinTaskSourceLanguageId(task: CrowdinTaskLocaleSource): string | null {
  const sourceLanguageId = task.sourceLanguageId?.trim();
  return sourceLanguageId ? sourceLanguageId : null;
}

export function extractCrowdinTaskPrimaryLanguageId(task: CrowdinTaskLocaleSource): string | null {
  const targetLanguageId = task.targetLanguageId?.trim();
  if (targetLanguageId) {
    return targetLanguageId;
  }

  const languageId = task.languageId?.trim();
  if (languageId) {
    return languageId;
  }

  const firstTargetLanguage = task.targetLanguages?.[0]?.id?.trim();
  return firstTargetLanguage ? firstTargetLanguage : null;
}
