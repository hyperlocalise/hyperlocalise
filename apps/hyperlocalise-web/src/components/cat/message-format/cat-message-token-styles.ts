export type CatMessageTokenVisualKind = "icu" | "placeholder" | "pound" | "tag" | "error";

export function catMessageTokenToneClass(kind: CatMessageTokenVisualKind) {
  switch (kind) {
    case "icu":
      return "border-bud-500/25 bg-bud-500/10 text-bud-900 dark:text-bud-300";
    case "placeholder":
      return "border-dew-500/25 bg-dew-500/10 text-dew-900 dark:text-dew-100";
    case "pound":
      return "border-grove-500/25 bg-grove-500/10 text-grove-900 dark:text-grove-300";
    case "tag":
      return "border-border bg-skeleton text-foreground";
    case "error":
      return "bg-flame-700/20 text-flame-900 dark:text-flame-100";
  }
}

export const catMessageTokenMissingClass =
  "border-bud-500/40 bg-bud-500/10 text-bud-900 dark:text-bud-300";
