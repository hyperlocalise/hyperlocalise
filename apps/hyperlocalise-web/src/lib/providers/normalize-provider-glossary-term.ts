export type ProviderGlossaryTermStatusInput = {
  status?: string | null;
  forbidden?: boolean | null;
};

/**
 * Maps provider-specific term status into Hyperlocalise glossary term flags.
 * Preferred terms enforce target usage; forbidden terms block target usage.
 */
export function normalizeProviderGlossaryTermFlags(input: ProviderGlossaryTermStatusInput): {
  forbidden: boolean;
} {
  if (input.forbidden === true) {
    return { forbidden: true };
  }

  if (input.forbidden === false) {
    return { forbidden: false };
  }

  const status = input.status?.trim().toLowerCase();
  if (!status) {
    return { forbidden: false };
  }

  if (status === "forbidden" || status === "not recommended" || status === "deprecated") {
    return { forbidden: true };
  }

  return { forbidden: false };
}
