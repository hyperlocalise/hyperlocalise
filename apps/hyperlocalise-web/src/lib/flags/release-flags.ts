import { flag } from "flags/next";

export const RELEASE_CAT_ALL_FILES_FLAG = "release-cat-all-files";

/**
 * Release gate for CAT All Files (native + Crowdin).
 *
 * Defaults off via `decide`. Enable with Flags Explorer overrides (or change
 * `decide`) — not evaluated through WorkOS.
 */
export const releaseCatAllFilesFlag = flag<boolean>({
  key: RELEASE_CAT_ALL_FILES_FLAG,
  description: "CAT All Files scope for native and Crowdin projects.",
  defaultValue: false,
  decide() {
    return false;
  },
});

export async function isReleaseCatAllFilesEnabled(): Promise<boolean> {
  try {
    return (await releaseCatAllFilesFlag()) === true;
  } catch {
    return false;
  }
}
