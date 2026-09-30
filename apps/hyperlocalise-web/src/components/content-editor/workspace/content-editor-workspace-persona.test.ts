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

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  isCatWorkspacePersona,
  readCatWorkspacePersona,
  writeCatWorkspacePersona,
  defaultPersonaForFileFamily,
  catWorkspacePersonaStorageKey,
  CAT_WORKSPACE_PERSONA_STORAGE_KEY_PREFIX,
} from "./content-editor-workspace-persona";

describe("content-editor-workspace-persona", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("isCatWorkspacePersona", () => {
    it("accepts valid personas", () => {
      expect(isCatWorkspacePersona("translator")).toBe(true);
      expect(isCatWorkspacePersona("designer")).toBe(true);
      expect(isCatWorkspacePersona("reviewer")).toBe(true);
    });

    it("rejects unknown values", () => {
      expect(isCatWorkspacePersona("editor")).toBe(false);
      expect(isCatWorkspacePersona(null)).toBe(false);
      expect(isCatWorkspacePersona(42)).toBe(false);
      expect(isCatWorkspacePersona("")).toBe(false);
    });
  });

  describe("defaultPersonaForFileFamily", () => {
    it("returns designer for image files", () => {
      expect(defaultPersonaForFileFamily("image")).toBe("designer");
    });

    it("returns designer for video files", () => {
      expect(defaultPersonaForFileFamily("video")).toBe("designer");
    });

    it("returns designer for office files", () => {
      expect(defaultPersonaForFileFamily("office")).toBe("designer");
    });

    it("returns designer for document files", () => {
      expect(defaultPersonaForFileFamily("document")).toBe("designer");
    });

    it("returns translator for text/string files", () => {
      expect(defaultPersonaForFileFamily("text")).toBe("translator");
    });

    it("returns translator for unknown families", () => {
      expect(defaultPersonaForFileFamily("unknown")).toBe("translator");
    });
  });

  describe("catWorkspacePersonaStorageKey", () => {
    it("namespaces by file family", () => {
      expect(catWorkspacePersonaStorageKey("text")).toBe(
        `${CAT_WORKSPACE_PERSONA_STORAGE_KEY_PREFIX}:text`,
      );
      expect(catWorkspacePersonaStorageKey("image")).toBe(
        `${CAT_WORKSPACE_PERSONA_STORAGE_KEY_PREFIX}:image`,
      );
    });
  });

  describe("readCatWorkspacePersona / writeCatWorkspacePersona", () => {
    it("returns null when storage is empty", () => {
      vi.stubGlobal("window", {
        localStorage: { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn() },
      });

      expect(readCatWorkspacePersona("text")).toBeNull();
    });

    it("reads stored persona", () => {
      vi.stubGlobal("window", {
        localStorage: {
          getItem: vi.fn().mockReturnValue("reviewer"),
          setItem: vi.fn(),
        },
      });

      expect(readCatWorkspacePersona("text")).toBe("reviewer");
    });

    it("rejects stored value that is not a valid persona", () => {
      vi.stubGlobal("window", {
        localStorage: {
          getItem: vi.fn().mockReturnValue("something-invalid"),
          setItem: vi.fn(),
        },
      });

      expect(readCatWorkspacePersona("text")).toBeNull();
    });

    it("writes persona to storage under the family-scoped key", () => {
      const setItem = vi.fn();
      vi.stubGlobal("window", {
        localStorage: { getItem: vi.fn(), setItem },
      });

      writeCatWorkspacePersona("image", "designer");

      expect(setItem).toHaveBeenCalledWith(
        `${CAT_WORKSPACE_PERSONA_STORAGE_KEY_PREFIX}:image`,
        "designer",
      );
    });

    it("does not throw when localStorage is unavailable", () => {
      vi.stubGlobal("window", {});
      expect(() => writeCatWorkspacePersona("text", "translator")).not.toThrow();
      expect(readCatWorkspacePersona("text")).toBeNull();
    });
  });
});
