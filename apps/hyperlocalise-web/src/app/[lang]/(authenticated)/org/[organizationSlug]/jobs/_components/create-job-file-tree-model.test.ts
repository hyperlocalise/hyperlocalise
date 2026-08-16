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
  allFolderPaths,
  buildCreateJobFileTree,
  collectCreateJobFileIds,
  filterCreateJobFileTree,
  folderFileIdsByPath,
  folderSelectionState,
  topLevelFolderPaths,
} from "./create-job-file-tree-model";

const files = [
  { id: "home", label: "marketing/home.json" },
  { id: "pricing", label: "marketing/pricing.json" },
  { id: "spring", label: "marketing/campaigns/spring.json" },
  { id: "terms", label: "legal/terms.json" },
  { id: "readme", label: "README.json" },
];

describe("buildCreateJobFileTree", () => {
  it("nests files under collapsible folders and keeps root files at the top level", () => {
    const tree = buildCreateJobFileTree(files);

    expect(tree).toEqual([
      {
        type: "folder",
        name: "legal",
        path: "legal",
        children: [
          {
            type: "file",
            id: "terms",
            name: "terms.json",
            path: "legal/terms.json",
          },
        ],
      },
      {
        type: "folder",
        name: "marketing",
        path: "marketing",
        children: [
          {
            type: "folder",
            name: "campaigns",
            path: "marketing/campaigns",
            children: [
              {
                type: "file",
                id: "spring",
                name: "spring.json",
                path: "marketing/campaigns/spring.json",
              },
            ],
          },
          {
            type: "file",
            id: "home",
            name: "home.json",
            path: "marketing/home.json",
          },
          {
            type: "file",
            id: "pricing",
            name: "pricing.json",
            path: "marketing/pricing.json",
          },
        ],
      },
      {
        type: "file",
        id: "readme",
        name: "README.json",
        path: "README.json",
      },
    ]);
  });

  it("collects descendant file ids and folder paths", () => {
    const tree = buildCreateJobFileTree(files);
    const marketing = tree.find((node) => node.type === "folder" && node.path === "marketing");

    expect(marketing).toBeDefined();
    expect(collectCreateJobFileIds(marketing!)).toEqual(["spring", "home", "pricing"]);
    expect(topLevelFolderPaths(tree)).toEqual(["legal", "marketing"]);
    expect(allFolderPaths(tree)).toEqual(["legal", "marketing", "marketing/campaigns"]);
    expect(Object.fromEntries(folderFileIdsByPath(tree))).toEqual({
      legal: ["terms"],
      marketing: ["spring", "home", "pricing"],
      "marketing/campaigns": ["spring"],
    });
  });
});

describe("folderSelectionState", () => {
  it("reports none, some, and all from the selected id set", () => {
    const ids = ["home", "pricing", "spring"];

    expect(folderSelectionState(ids, new Set())).toBe("none");
    expect(folderSelectionState(ids, new Set(["home"]))).toBe("some");
    expect(folderSelectionState(ids, new Set(ids))).toBe("all");
  });
});

describe("filterCreateJobFileTree", () => {
  it("keeps matching files and ancestor folders", () => {
    const tree = buildCreateJobFileTree(files);
    const filtered = filterCreateJobFileTree(tree, "spring");

    expect(filtered).toEqual([
      {
        type: "folder",
        name: "marketing",
        path: "marketing",
        children: [
          {
            type: "folder",
            name: "campaigns",
            path: "marketing/campaigns",
            children: [
              {
                type: "file",
                id: "spring",
                name: "spring.json",
                path: "marketing/campaigns/spring.json",
              },
            ],
          },
        ],
      },
    ]);
  });

  it("returns the original tree when the query is empty", () => {
    const tree = buildCreateJobFileTree(files);
    expect(filterCreateJobFileTree(tree, "  ")).toBe(tree);
  });
});
