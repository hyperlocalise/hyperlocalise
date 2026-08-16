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
import { describe, expect, it } from "vite-plus/test";

import {
  buildChatProjectOptions,
  resolveChatProjectLabel,
  resolveChatProjectSelection,
} from "./project-selector-model";

describe("project selector model", () => {
  it("merges live TMS projects ahead of native projects", () => {
    expect(
      buildChatProjectOptions({
        nativeProjects: [
          { id: "proj_native", name: "Mobile", source: "native" },
          { id: "proj_synced", name: "Synced Crowdin", source: "external_tms" },
        ],
        tmsProjects: [
          {
            id: "ext:crowdin:42",
            name: "Crowdin App",
            source: "external_tms",
            externalProviderKind: "crowdin",
          },
          {
            id: "ext:crowdin:99",
            name: "Inactive",
            source: "external_tms",
            isActive: false,
          },
        ],
      }),
    ).toEqual([
      {
        id: "ext:crowdin:42",
        name: "Crowdin App",
        source: "external_tms",
        externalProviderKind: "crowdin",
      },
      {
        id: "proj_native",
        name: "Mobile",
        source: "native",
        externalProviderKind: null,
      },
    ]);
  });

  it("prefers locked, selected, initial, then single-project auto-select", () => {
    const projects = buildChatProjectOptions({
      nativeProjects: [
        { id: "proj_a", name: "A", source: "native" },
        { id: "proj_b", name: "B", source: "native" },
      ],
      tmsProjects: [],
    });

    expect(
      resolveChatProjectSelection({
        projects,
        selectedProjectId: "proj_b",
        lockedProjectId: "proj_a",
        initialProjectId: "proj_b",
      }),
    ).toBe("proj_a");

    expect(
      resolveChatProjectSelection({
        projects,
        selectedProjectId: "proj_b",
        initialProjectId: "proj_a",
      }),
    ).toBe("proj_b");

    expect(
      resolveChatProjectSelection({
        projects,
        selectedProjectId: "",
        initialProjectId: "proj_b",
      }),
    ).toBe("proj_b");

    expect(
      resolveChatProjectSelection({
        projects: [],
        selectedProjectId: "",
        initialProjectId: "cat-project",
      }),
    ).toBe("cat-project");

    expect(
      resolveChatProjectSelection({
        projects: projects.slice(0, 1),
        selectedProjectId: "",
      }),
    ).toBe("proj_a");
  });

  it("resolves labels from the project list or locked fallback name", () => {
    const projects = buildChatProjectOptions({
      nativeProjects: [{ id: "proj_a", name: "Mobile", source: "native" }],
      tmsProjects: [],
    });

    expect(
      resolveChatProjectLabel({
        projects,
        projectId: "proj_a",
        placeholder: "Project",
      }),
    ).toBe("Mobile");

    expect(
      resolveChatProjectLabel({
        projects,
        projectId: "ext:crowdin:42",
        fallbackName: "CAT Project",
        placeholder: "Project",
      }),
    ).toBe("CAT Project");
  });
});
