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
import { describe, expect, it, vi } from "vite-plus/test";

import { fetchTranslationProjectRow } from "./project-page-shell";

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          projects: {
            ":projectId": {
              $get: (...args: unknown[]) => getMock(...args),
            },
          },
        },
      },
    },
  },
}));

describe("fetchTranslationProjectRow", () => {
  it("maps a native go-svc project into the settings form row shape", async () => {
    const goSvcClient = {
      project: {
        get: vi.fn().mockResolvedValue({
          project: {
            id: "project_1",
            name: "Hyperlocalise Webapp",
            identifier: "HL",
            description: "Ops notes",
            translationContext: "Keep product names in English.",
            source: "native",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        }),
      },
    };

    const project = await fetchTranslationProjectRow("acme", "project_1", goSvcClient);

    expect(project.descriptionValue).toBe("Ops notes");
    expect(project.translationContextValue).toBe("Keep product names in English.");
    expect(project.targetLocales).toEqual(["fr-FR"]);
    expect(getMock).not.toHaveBeenCalled();
  });
});
