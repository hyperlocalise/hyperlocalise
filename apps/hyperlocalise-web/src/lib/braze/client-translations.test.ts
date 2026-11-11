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
  BrazeApiError,
  brazePermissionNameFromError,
  classifyBrazeError,
  isBrazeDragAndDropTemplateError,
  readErrorMessage,
  readTranslationEntries,
} from "./client";

describe("readTranslationEntries", () => {
  it("keeps string maps, locale UUID, and optional timestamps", () => {
    expect(
      readTranslationEntries({
        translations: [
          {
            translation_map: { hello: "Bonjour", skip: 1, empty: "" },
            locale: { uuid: " locale-fr ", name: "fr-FR", locale_key: "fr-fr" },
            updated_at: "2026-10-12T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual([
      {
        translation_map: { hello: "Bonjour", empty: "" },
        locale: {
          uuid: "locale-fr",
          name: "fr-FR",
          locale_key: "fr-fr",
          language: undefined,
          country: undefined,
        },
        updatedAt: "2026-10-12T00:00:00.000Z",
      },
    ]);
  });

  it("reads an object-shaped translations envelope", () => {
    expect(
      readTranslationEntries({
        translations: {
          translation_map: { id_0: "Here's a Million Dollars", id_1: "Hello World!" },
        },
        message: "success",
      }),
    ).toEqual([
      {
        translation_map: { id_0: "Here's a Million Dollars", id_1: "Hello World!" },
        locale: {
          uuid: "",
          name: undefined,
          locale_key: undefined,
          language: undefined,
          country: undefined,
        },
        updatedAt: undefined,
      },
    ]);
  });

  it("reads a single translation_map body and last_edited", () => {
    expect(
      readTranslationEntries({
        translation_map: { id_0: "Hello" },
        locale: { uuid: "src" },
        last_edited: "2026-10-11T12:00:00.000Z",
      }),
    ).toEqual([
      {
        translation_map: { id_0: "Hello" },
        locale: {
          uuid: "src",
          name: undefined,
          locale_key: undefined,
          language: undefined,
          country: undefined,
        },
        updatedAt: "2026-10-11T12:00:00.000Z",
      },
    ]);
  });

  it("drops non-object entries", () => {
    expect(readTranslationEntries({ translations: [null, "nope", 3] })).toEqual([]);
    expect(readTranslationEntries(null)).toEqual([]);
  });
});

describe("Braze error bodies", () => {
  it("reads the documented errors array and classifies multi-language support", () => {
    const message = readErrorMessage(
      { errors: [{ message: "This message does not support multi-language." }] },
      "Braze request failed (400).",
    );
    expect(message).toBe("This message does not support multi-language.");
    expect(classifyBrazeError(400, message)).toBe("braze_no_multi_language");
  });

  it("still prefers a top-level message when present", () => {
    expect(
      readErrorMessage(
        { message: "Invalid API key", errors: [{ message: "ignored" }] },
        "fallback",
      ),
    ).toBe("Invalid API key");
  });

  it("classifies campaign and canvas permission codes from the request path", () => {
    expect(classifyBrazeError(403, "forbidden", "/campaigns/details")).toBe(
      "braze_permission_missing_campaigns.details",
    );
    expect(classifyBrazeError(401, "unauthorized", "/campaigns/translations", "GET")).toBe(
      "braze_permission_missing_campaigns.translations.get",
    );
    expect(classifyBrazeError(403, "forbidden", "/campaigns/translations", "PUT")).toBe(
      "braze_permission_missing_campaigns.translations.update",
    );
    expect(classifyBrazeError(403, "forbidden", "/canvas/details")).toBe(
      "braze_permission_missing_canvas.details",
    );
    expect(classifyBrazeError(401, "unauthorized", "/canvas/translations", "GET")).toBe(
      "braze_permission_missing_canvas.translations.get",
    );
    expect(classifyBrazeError(403, "forbidden", "/canvas/translations", "PUT")).toBe(
      "braze_permission_missing_canvas.translations.update",
    );
    expect(classifyBrazeError(403, "forbidden", "/templates/email/info")).toBe(
      "braze_unauthorized",
    );
  });

  it("recognizes drag-and-drop templates from the code or message", () => {
    expect(classifyBrazeError(400, "This is a drag-and-drop template")).toBe(
      "braze_drag_and_drop_template",
    );
    expect(
      isBrazeDragAndDropTemplateError(
        new BrazeApiError({
          message: "Unsupported drag and drop template",
          status: 400,
        }),
      ),
    ).toBe(true);
    expect(
      isBrazeDragAndDropTemplateError(
        new BrazeApiError({
          message: "unsupported",
          status: 400,
          code: "braze_drag_and_drop_template",
        }),
      ),
    ).toBe(true);
    expect(
      isBrazeDragAndDropTemplateError(
        new BrazeApiError({
          message: "rate limited",
          status: 429,
        }),
      ),
    ).toBe(false);
    expect(isBrazeDragAndDropTemplateError(new Error("drag-and-drop"))).toBe(false);
  });

  it("extracts the missing Braze permission name from classified errors", () => {
    expect(
      brazePermissionNameFromError(
        new BrazeApiError({
          message: "forbidden",
          status: 403,
          code: "braze_permission_missing_campaigns.translations.update",
        }),
      ),
    ).toBe("campaigns.translations.update");
    expect(
      brazePermissionNameFromError(
        new BrazeApiError({
          message: "unauthorized",
          status: 401,
          code: "braze_unauthorized",
        }),
      ),
    ).toBeNull();
    expect(brazePermissionNameFromError(new Error("forbidden"))).toBeNull();
  });
});
