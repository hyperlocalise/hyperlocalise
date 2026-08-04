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

import { buildHyperlocaliseDynamicSections } from "./agent";

describe("buildHyperlocaliseDynamicSections", () => {
  it("routes Crowdin-linked projects to Crowdin glossary search when enabled", () => {
    const sections = buildHyperlocaliseDynamicSections({
      surface: "web",
      projectId: "project-1",
      glossarySearchEnabled: true,
      attachedProject: {
        projectId: "project-1",
        projectName: "Heidi",
        projectSource: "external_tms",
        externalProviderKind: "crowdin",
      },
    });

    expect(sections.join("\n")).toContain("Heidi (project-1)");
    expect(sections.join("\n")).toContain("search_crowdin_glossary");
    expect(sections.join("\n")).not.toContain("search_native_glossary");
  });

  it("routes native projects to native glossary search when enabled", () => {
    const sections = buildHyperlocaliseDynamicSections({
      surface: "web",
      projectId: "project-2",
      glossarySearchEnabled: true,
      attachedProject: {
        projectId: "project-2",
        projectName: "Native app",
        projectSource: "native",
        externalProviderKind: null,
      },
    });

    expect(sections.join("\n")).toContain("search_native_glossary");
    expect(sections.join("\n")).not.toContain("search_crowdin_glossary");
  });

  it("omits glossary tool routing when the feature flag is off", () => {
    const sections = buildHyperlocaliseDynamicSections({
      surface: "web",
      projectId: "project-2",
      glossarySearchEnabled: false,
      attachedProject: {
        projectId: "project-2",
        projectName: "Native app",
        projectSource: "native",
        externalProviderKind: null,
      },
    });

    expect(sections.join("\n")).toContain("Native app (project-2)");
    expect(sections.join("\n")).not.toContain("search_native_glossary");
    expect(sections.join("\n")).not.toContain("search_crowdin_glossary");
  });

  it("routes live Crowdin project ids without a local projects row", () => {
    const sections = buildHyperlocaliseDynamicSections({
      surface: "web",
      projectId: "ext:crowdin:42",
      glossarySearchEnabled: true,
      attachedProject: {
        projectId: "ext:crowdin:42",
        projectSource: "external_tms",
        externalProviderKind: "crowdin",
      },
    });

    expect(sections.join("\n")).toContain("ext:crowdin:42");
    expect(sections.join("\n")).toContain("search_crowdin_glossary");
  });
});
