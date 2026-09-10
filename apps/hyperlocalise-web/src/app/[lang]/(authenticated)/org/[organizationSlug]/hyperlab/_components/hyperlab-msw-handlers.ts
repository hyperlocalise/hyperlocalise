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
import { delay, http, HttpResponse } from "msw";

import {
  hyperlabAbExperiment,
  hyperlabAbExperimentDetail,
  hyperlabAssignmentsFixture,
  hyperlabAudiencesFixture,
  hyperlabCheckoutFlag,
  hyperlabExperimentsFixture,
  hyperlabFlagsFixture,
  hyperlabJapanAudience,
  hyperlabKeysFixture,
  hyperlabPaidAudience,
  hyperlabProductionKey,
  hyperlabThemeConfig,
  hyperlabThemeFlag,
  hyperlabToggleExperiment,
  hyperlabToggleExperimentDetail,
} from "./hyperlab.fixture";
import type {
  HyperlabAssignment,
  HyperlabAudience,
  HyperlabClientKey,
  HyperlabExperiment,
  HyperlabFlag,
  HyperlabFlagConfig,
} from "./hyperlab-api";

const experimentDetails = {
  [hyperlabAbExperiment.id]: hyperlabAbExperimentDetail,
  [hyperlabToggleExperiment.id]: hyperlabToggleExperimentDetail,
};

const audienceDetails = {
  [hyperlabJapanAudience.id]: hyperlabJapanAudience,
  [hyperlabPaidAudience.id]: hyperlabPaidAudience,
};

const flagDetails: Record<string, { flag: HyperlabFlag; config: HyperlabFlagConfig }> = {
  [hyperlabCheckoutFlag.id]: {
    flag: hyperlabCheckoutFlag,
    config: { flagId: hyperlabCheckoutFlag.id, value: null },
  },
  [hyperlabThemeFlag.id]: {
    flag: hyperlabThemeFlag,
    config: hyperlabThemeConfig,
  },
};

export function createHyperlabMswHandlers({
  experiments = hyperlabExperimentsFixture,
  audiences = hyperlabAudiencesFixture,
  flags = hyperlabFlagsFixture,
  assignments = hyperlabAssignmentsFixture,
  keys = hyperlabKeysFixture,
  wait,
  errorMessage,
}: {
  experiments?: HyperlabExperiment[];
  audiences?: HyperlabAudience[];
  flags?: HyperlabFlag[];
  assignments?: HyperlabAssignment[];
  keys?: HyperlabClientKey[];
  wait?: "infinite";
  errorMessage?: string;
} = {}) {
  async function maybeWait() {
    if (wait === "infinite") {
      await delay("infinite");
    }
  }

  function fail() {
    return HttpResponse.json({ message: errorMessage }, { status: 500 });
  }

  return [
    http.get("/api/orgs/:organizationSlug/hyperlab/experiments", async () => {
      await maybeWait();
      if (errorMessage) {
        return fail();
      }
      return HttpResponse.json({ experiments });
    }),
    http.get(
      "/api/orgs/:organizationSlug/hyperlab/experiments/:experimentId",
      async ({ params }) => {
        await maybeWait();
        if (errorMessage) {
          return fail();
        }
        const detail = experimentDetails[String(params.experimentId)];
        if (!detail) {
          return HttpResponse.json({ message: "experiment_not_found" }, { status: 404 });
        }
        return HttpResponse.json(detail);
      },
    ),
    http.get("/api/orgs/:organizationSlug/hyperlab/audiences", async () => {
      await maybeWait();
      if (errorMessage) {
        return fail();
      }
      return HttpResponse.json({ audiences });
    }),
    http.get("/api/orgs/:organizationSlug/hyperlab/audiences/:audienceId", async ({ params }) => {
      await maybeWait();
      if (errorMessage) {
        return fail();
      }
      const audience = audienceDetails[String(params.audienceId)];
      if (!audience) {
        return HttpResponse.json({ message: "audience_not_found" }, { status: 404 });
      }
      return HttpResponse.json({ audience });
    }),
    http.get("/api/orgs/:organizationSlug/hyperlab/flags", async () => {
      await maybeWait();
      if (errorMessage) {
        return fail();
      }
      return HttpResponse.json({ flags });
    }),
    http.get("/api/orgs/:organizationSlug/hyperlab/flags/:flagId", async ({ params }) => {
      await maybeWait();
      if (errorMessage) {
        return fail();
      }
      const detail = flagDetails[String(params.flagId)];
      if (!detail) {
        return HttpResponse.json({ message: "flag_not_found" }, { status: 404 });
      }
      return HttpResponse.json(detail);
    }),
    http.get("/api/orgs/:organizationSlug/hyperlab/assignments", async () => {
      await maybeWait();
      if (errorMessage) {
        return fail();
      }
      return HttpResponse.json({ assignments });
    }),
    http.get("/api/orgs/:organizationSlug/hyperlab/keys", async () => {
      await maybeWait();
      if (errorMessage) {
        return fail();
      }
      return HttpResponse.json({ keys });
    }),
    http.post("/api/orgs/:organizationSlug/hyperlab/experiments", async ({ request }) => {
      const body = (await request.json()) as { name?: string; kind?: "toggle" | "ab" };
      return HttpResponse.json(
        {
          experiment: {
            ...hyperlabToggleExperiment,
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            name: body.name || "New experiment",
            kind: body.kind ?? "toggle",
            status: "draft",
          },
        },
        { status: 201 },
      );
    }),
    http.post("/api/orgs/:organizationSlug/hyperlab/experiments/:experimentId/variants", () =>
      HttpResponse.json({ variant: hyperlabToggleExperimentDetail.variants[0] }, { status: 201 }),
    ),
    http.post("/api/orgs/:organizationSlug/hyperlab/flags", async ({ request }) => {
      const body = (await request.json()) as { key?: string };
      return HttpResponse.json(
        {
          flag: {
            ...hyperlabCheckoutFlag,
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            key: body.key || "new-flag",
          },
        },
        { status: 201 },
      );
    }),
    http.post("/api/orgs/:organizationSlug/hyperlab/audiences", async ({ request }) => {
      const body = (await request.json()) as { name?: string };
      return HttpResponse.json(
        {
          audience: {
            ...hyperlabJapanAudience,
            id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            name: body.name || "New audience",
            criterion: null,
          },
        },
        { status: 201 },
      );
    }),
    http.post("/api/orgs/:organizationSlug/hyperlab/keys", async ({ request }) => {
      const body = (await request.json()) as { name?: string };
      return HttpResponse.json(
        {
          key: {
            ...hyperlabProductionKey,
            id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            name: body.name || "New key",
            secret: "hlk_storybook_secret_once",
          },
        },
        { status: 201 },
      );
    }),
  ];
}

export const hyperlabPopulatedMswHandlers = createHyperlabMswHandlers();
export const hyperlabEmptyMswHandlers = createHyperlabMswHandlers({
  experiments: [],
  audiences: [],
  flags: [],
  assignments: [],
  keys: [],
});
export const hyperlabLoadingMswHandlers = createHyperlabMswHandlers({ wait: "infinite" });
export const hyperlabErrorMswHandlers = createHyperlabMswHandlers({
  errorMessage: "The Hyperlab API returned a 500.",
});
