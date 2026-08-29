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
// @vitest-environment happy-dom

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { createProjectFileRecord } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/files/_components/project-files.fixture";
import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import { CONTENT_EDITOR_ALL_FILES_SOURCE_PATH } from "@/lib/projects/content-editor-all-files";

vi.mock("../files/_components/project-files-tree", () => ({
  ProjectFilesTree: ({
    files,
    onSelectFile,
    onActivateFile,
  }: {
    files: Array<{ sourcePath: string; filename: string }>;
    onSelectFile: (sourcePath: string) => void;
    onActivateFile?: (sourcePath: string) => void;
  }) => (
    <ul>
      {files.map((file) => (
        <li key={file.sourcePath}>
          <button type="button" onClick={() => onSelectFile(file.sourcePath)}>
            {file.filename}
          </button>
          <button
            type="button"
            onClick={() => onActivateFile?.(file.sourcePath)}
            aria-label={`Activate ${file.filename}`}
          >
            Activate
          </button>
        </li>
      ))}
    </ul>
  ),
}));

import {
  ContentEditorFileTreePicker,
  contentEditorSourcePathDisplayName,
} from "./content-editor-header-pickers";

const homeFile = createProjectFileRecord({
  sourcePath: "marketing/home.json",
  filename: "home.json",
});
const pricingFile = createProjectFileRecord({
  sourcePath: "marketing/pricing.json",
  filename: "pricing.json",
});

async function openSourceFileDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Source file" }));
  await screen.findByRole("dialog", { name: "Choose source file" });
  return user;
}

describe("contentEditorSourcePathDisplayName", () => {
  it("returns the basename of a nested source path", () => {
    expect(contentEditorSourcePathDisplayName("lang/en-US.json")).toBe("en-US.json");
  });

  it("returns the original path when it has no directories", () => {
    expect(contentEditorSourcePathDisplayName("en-US.json")).toBe("en-US.json");
  });
});

describe("ContentEditorFileTreePicker repository selection", () => {
  it("commits the chosen repository under the destination file path", async () => {
    const onSelectFile = vi.fn();
    const onRepositoryChange = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorFileTreePicker
        files={[homeFile, pricingFile]}
        selectedSourcePath={homeFile.sourcePath}
        onSelectFile={onSelectFile}
        onSelectAllFiles={vi.fn()}
        repositoryFullNames={["acme/web", "acme/docs"]}
        selectedRepositoryFullName="acme/web"
        onRepositoryChange={onRepositoryChange}
      />,
    );

    const user = await openSourceFileDialog();
    await user.click(screen.getByLabelText("GitHub repository"));
    await user.click(await screen.findByRole("option", { name: "acme/docs" }));
    await user.click(screen.getByRole("button", { name: "pricing.json" }));
    await user.click(screen.getByRole("button", { name: "Open file" }));

    expect(onRepositoryChange).toHaveBeenCalledWith("acme/docs", pricingFile.sourcePath);
    expect(onSelectFile).toHaveBeenCalledWith(pricingFile.sourcePath);
    expect(onRepositoryChange.mock.invocationCallOrder[0]).toBeLessThan(
      onSelectFile.mock.invocationCallOrder[0]!,
    );
  });

  it("commits the chosen repository under All Files before navigating", async () => {
    const onSelectFile = vi.fn();
    const onSelectAllFiles = vi.fn();
    const onRepositoryChange = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorFileTreePicker
        files={[homeFile, pricingFile]}
        selectedSourcePath={homeFile.sourcePath}
        onSelectFile={onSelectFile}
        onSelectAllFiles={onSelectAllFiles}
        repositoryFullNames={["acme/web", "acme/docs"]}
        selectedRepositoryFullName="acme/web"
        onRepositoryChange={onRepositoryChange}
      />,
    );

    const user = await openSourceFileDialog();
    await user.click(screen.getByLabelText("GitHub repository"));
    await user.click(await screen.findByRole("option", { name: "acme/docs" }));
    await user.click(screen.getByRole("button", { name: "All Files" }));
    await user.click(screen.getByRole("button", { name: "Open file" }));

    expect(onRepositoryChange).toHaveBeenCalledWith(
      "acme/docs",
      CONTENT_EDITOR_ALL_FILES_SOURCE_PATH,
    );
    expect(onSelectAllFiles).toHaveBeenCalledOnce();
    expect(onSelectFile).not.toHaveBeenCalled();
  });

  it("commits the destination path when a file is activated from the tree", async () => {
    const onSelectFile = vi.fn();
    const onRepositoryChange = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorFileTreePicker
        files={[homeFile, pricingFile]}
        selectedSourcePath={homeFile.sourcePath}
        onSelectFile={onSelectFile}
        repositoryFullNames={["acme/web", "acme/docs"]}
        selectedRepositoryFullName="acme/web"
        onRepositoryChange={onRepositoryChange}
      />,
    );

    const user = await openSourceFileDialog();
    await user.click(screen.getByLabelText("GitHub repository"));
    await user.click(await screen.findByRole("option", { name: "acme/docs" }));
    await user.click(screen.getByRole("button", { name: "Activate pricing.json" }));

    expect(onRepositoryChange).toHaveBeenCalledWith("acme/docs", pricingFile.sourcePath);
    expect(onSelectFile).toHaveBeenCalledWith(pricingFile.sourcePath);
  });
});
