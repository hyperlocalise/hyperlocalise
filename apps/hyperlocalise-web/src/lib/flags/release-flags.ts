/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { flag } from "flags/next";

import type { AppAuthContext } from "@/lib/workos/app-auth";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import { supportsContentEditorAllFilesProvider } from "@/lib/projects/content-editor-all-files";

import { createWorkosIdentify } from "./identify-workos-context";
import { workosAdapter } from "./workos-adapter";
import type { WorkosFlagEntities } from "./workos-flag-entities";
import {
  RELEASE_CAT_ALL_FILES_FLAG,
  RELEASE_CAT_ADAPTIVE_WORKSPACE_FLAG,
  RELEASE_QA_SANDBOX_VCR_IMAGE_FLAG,
  RELEASE_SANDBOX_VCR_IMAGE_FLAG,
} from "./release-flag-keys";

export {
  RELEASE_CAT_ALL_FILES_FLAG,
  RELEASE_CAT_ADAPTIVE_WORKSPACE_FLAG,
  RELEASE_QA_SANDBOX_VCR_IMAGE_FLAG,
  RELEASE_SANDBOX_VCR_IMAGE_FLAG,
} from "./release-flag-keys";

export type ReleaseContentEditorAllFilesEntities = {
  /** `null` / omitted = native project; otherwise the live TMS provider kind. */
  providerKind?: ExternalTmsProviderKind | null;
};

/**
 * Release gate for CAT All Files and the project Content Editor sidebar.
 *
 * `decide` enables All Files only for native projects and Crowdin. Pass
 * `providerKind` via `.run({ identify })` / `isReleaseContentEditorAllFilesEnabled`.
 * Flags Explorer overrides still win over `decide`.
 */
export const releaseContentEditorAllFilesFlag = flag<boolean, ReleaseContentEditorAllFilesEntities>(
  {
    key: RELEASE_CAT_ALL_FILES_FLAG,
    description: "CAT All Files and the Content Editor sidebar for native and Crowdin projects.",
    defaultValue: false,
    decide({ entities }) {
      return supportsContentEditorAllFilesProvider(entities?.providerKind);
    },
  },
);

export async function isReleaseContentEditorAllFilesEnabled(
  providerKind?: ExternalTmsProviderKind | null,
): Promise<boolean> {
  try {
    return (
      (await releaseContentEditorAllFilesFlag.run({
        identify: { providerKind: providerKind ?? null },
      })) === true
    );
  } catch {
    return false;
  }
}

/**
 * Release gate for creating sandboxes from the hyperlocalise-sandbox VCR image.
 *
 * `decide` enables when `RELEASE_SANDBOX_VCR_IMAGE=true` so workflow/sandbox
 * create paths (no HTTP request) can cut over. Flags Explorer overrides still
 * win over `decide` when a request context exists. Callers must also set
 * `VERCEL_SANDBOX_IMAGE`; otherwise create falls back to the managed runtime.
 */
export const releaseSandboxVcrImageFlag = flag<boolean>({
  key: RELEASE_SANDBOX_VCR_IMAGE_FLAG,
  description:
    "Create Vercel Sandboxes from the hyperlocalise-sandbox image in Vercel Container Registry.",
  defaultValue: false,
  decide() {
    // Read process.env directly so this module does not import `@/lib/env`
    // (heavy validation) and so workflow paths without request context work.
    return process.env.RELEASE_SANDBOX_VCR_IMAGE === "true";
  },
});

export async function isReleaseSandboxVcrImageEnabled(): Promise<boolean> {
  try {
    return (await releaseSandboxVcrImageFlag.run({ identify: {} })) === true;
  } catch {
    return false;
  }
}

/**
 * Release gate for translation QA sandboxes (Hunspell dictionaries baked into VCR).
 *
 * `decide` enables when `RELEASE_QA_SANDBOX_VCR_IMAGE=true` so cron/workflow QA
 * paths can use the custom image without enabling the global sandbox cutover.
 * Also respects {@link isReleaseSandboxVcrImageEnabled} when `imageScope` is `qa`.
 */
export const releaseQaSandboxVcrImageFlag = flag<boolean>({
  key: RELEASE_QA_SANDBOX_VCR_IMAGE_FLAG,
  description: "Create translation QA Vercel Sandboxes from the hyperlocalise-sandbox VCR image.",
  defaultValue: false,
  decide() {
    return process.env.RELEASE_QA_SANDBOX_VCR_IMAGE === "true";
  },
});

export async function isReleaseQaSandboxVcrImageEnabled(): Promise<boolean> {
  try {
    return (await releaseQaSandboxVcrImageFlag.run({ identify: {} })) === true;
  } catch {
    return false;
  }
}

export type VercelSandboxImageScope = "default" | "qa";

/** Whether a sandbox create should use `VERCEL_SANDBOX_IMAGE` for the given scope. */
export async function isHyperlocaliseSandboxVcrImageEnabledForScope(
  imageScope: VercelSandboxImageScope,
): Promise<boolean> {
  if (imageScope === "qa") {
    return (await isReleaseSandboxVcrImageEnabled()) || (await isReleaseQaSandboxVcrImageEnabled());
  }
  return await isReleaseSandboxVcrImageEnabled();
}

/**
 * Release gate for the adaptive workspace persona system in the Content Editor
 * (Translator / Designer / Reviewer layout presets + per-file-family auto-detection).
 *
 * Controlled per-organization or per-user in WorkOS Feature Flags dashboard, or
 * overridden via Flags Explorer.
 */
export const releaseCatAdaptiveWorkspaceFlag = flag<boolean, WorkosFlagEntities>({
  key: RELEASE_CAT_ADAPTIVE_WORKSPACE_FLAG,
  description:
    "Adaptive workspace personas for the Content Editor (Translator / Designer / Reviewer).",
  defaultValue: false,
  adapter: workosAdapter(),
});

export async function isReleaseCatAdaptiveWorkspaceEnabled(
  auth?: Pick<AppAuthContext, "activeOrganization" | "user">,
): Promise<boolean> {
  try {
    return (
      (await releaseCatAdaptiveWorkspaceFlag.run({
        identify: auth ? () => createWorkosIdentify(auth) : () => ({}),
      })) === true
    );
  } catch {
    return false;
  }
}
