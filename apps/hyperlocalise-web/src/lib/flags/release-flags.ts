import { flag } from "flags/next";

import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import { supportsCatAllFilesProvider } from "@/lib/projects/cat-all-files";

import { RELEASE_CAT_ALL_FILES_FLAG } from "./release-flag-keys";

export { RELEASE_CAT_ALL_FILES_FLAG } from "./release-flag-keys";

export type ReleaseCatAllFilesEntities = {
  /** `null` / omitted = native project; otherwise the live TMS provider kind. */
  providerKind?: ExternalTmsProviderKind | null;
};

/**
 * Release gate for CAT All Files and the project Strings sidebar.
 *
 * `decide` enables All Files only for native projects and Crowdin. Pass
 * `providerKind` via `.run({ identify })` / `isReleaseCatAllFilesEnabled`.
 * Flags Explorer overrides still win over `decide`.
 */
export const releaseCatAllFilesFlag = flag<boolean, ReleaseCatAllFilesEntities>({
  key: RELEASE_CAT_ALL_FILES_FLAG,
  description: "CAT All Files and Strings sidebar for native and Crowdin projects.",
  defaultValue: false,
  decide({ entities }) {
    return supportsCatAllFilesProvider(entities?.providerKind);
  },
});

export async function isReleaseCatAllFilesEnabled(
  providerKind?: ExternalTmsProviderKind | null,
): Promise<boolean> {
  try {
    return (
      (await releaseCatAllFilesFlag.run({
        identify: { providerKind: providerKind ?? null },
      })) === true
    );
  } catch {
    return false;
  }
}
