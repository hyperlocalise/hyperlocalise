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
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { StoryblokManagementClient } from "./client";
import type { StoryblokRegion } from "./constants";
import type {
  StoryblokClientError,
  StoryblokDiscoveryResult,
  StoryblokSpace,
  StoryblokStorySummary,
} from "./types";

export const STORYBLOK_TRANSLATION_EXPORT_UNAVAILABLE_MESSAGE =
  "This space's Storyblok plan doesn't include translation export and import. Upgrade the space to a plan that includes it, then try again.";

/**
 * Probes export.json on one story. 403 and 422 mean the plan does not include
 * translation export. An empty space cannot be probed, so it counts as
 * available and the first import reports the real answer.
 */
async function probeTranslationExport(input: {
  client: StoryblokManagementClient;
  spaceId: string;
  signal?: AbortSignal;
}): Promise<Result<boolean, StoryblokClientError>> {
  const stories = await input.client.listStories({ spaceId: input.spaceId, signal: input.signal });
  if (isErr(stories)) {
    return stories;
  }
  const story = stories.value.stories[0];
  if (!story) {
    return ok(true);
  }
  const exported = await input.client.exportStory({
    spaceId: input.spaceId,
    storyId: story.id,
    signal: input.signal,
  });
  if (isErr(exported)) {
    if (isStoryblokTranslationExportUnavailable(exported.error)) {
      return ok(false);
    }
    return exported;
  }
  return ok(true);
}

export function isStoryblokTranslationExportUnavailable(error: StoryblokClientError): boolean {
  return error.status === 403 || error.status === 422;
}

export async function discoverStoryblokWithToken(input: {
  accessToken: string;
  region: StoryblokRegion;
  spaceId?: string | null;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<Result<StoryblokDiscoveryResult, StoryblokClientError>> {
  const client = new StoryblokManagementClient({
    accessToken: input.accessToken,
    region: input.region,
    fetchImpl: input.fetchImpl,
  });

  const spacesResult = await client.listSpaces({ signal: input.signal });
  if (isErr(spacesResult)) {
    return spacesResult;
  }

  const spaceId = input.spaceId?.trim() || spacesResult.value[0]?.id || "";
  if (!spaceId) {
    return ok({
      spaces: spacesResult.value,
      space: null,
      folders: [],
      translationExportAvailable: false,
    });
  }

  const spaceResult = await client.getSpace(spaceId, { signal: input.signal });
  if (isErr(spaceResult)) {
    return spaceResult;
  }
  const space: StoryblokSpace = spaceResult.value;

  const folders: StoryblokStorySummary[] = [];
  const foldersResult = await client.listStories({
    spaceId,
    foldersOnly: true,
    signal: input.signal,
  });
  if (isErr(foldersResult)) {
    return foldersResult;
  }
  folders.push(...foldersResult.value.stories);

  const exportProbe = await probeTranslationExport({ client, spaceId, signal: input.signal });
  if (isErr(exportProbe)) {
    return exportProbe;
  }

  return ok({
    spaces: spacesResult.value,
    space,
    folders,
    translationExportAvailable: exportProbe.value,
  });
}

export async function validateStoryblokAccessToken(input: {
  accessToken: string;
  region: StoryblokRegion;
  spaceId: string;
  fetchImpl?: typeof fetch;
}): Promise<Result<StoryblokDiscoveryResult, StoryblokClientError>> {
  const discovery = await discoverStoryblokWithToken(input);
  if (isErr(discovery)) {
    if (discovery.error.status === 401) {
      return err({
        ...discovery.error,
        message: "Invalid or expired Storyblok personal access token.",
      });
    }
    if (discovery.error.status === 0) {
      return err({
        ...discovery.error,
        message: "Couldn't reach Storyblok in this region. Check the space's region.",
      });
    }
    return discovery;
  }

  if (!discovery.value.space) {
    return err({
      code: "storyblok_request_failed",
      status: 404,
      message: "Space not found for this token and region.",
      operation: "validateStoryblokAccessToken",
    });
  }

  if (!discovery.value.translationExportAvailable) {
    return err({
      code: "storyblok_request_failed",
      status: 403,
      message: STORYBLOK_TRANSLATION_EXPORT_UNAVAILABLE_MESSAGE,
      operation: "validateStoryblokAccessToken",
    });
  }

  return discovery;
}
