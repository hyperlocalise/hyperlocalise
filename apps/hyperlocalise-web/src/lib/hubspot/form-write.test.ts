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

import { HUBSPOT_FORM_V3_EMBED_TYPE, isNewEditorForm } from "./form-definition";
import { formDefinitionForWrite } from "./form-write";

describe("formDefinitionForWrite", () => {
  it("keeps a createdAt date on a new form", () => {
    const definition = formDefinitionForWrite(
      {
        id: "source-form",
        name: "Newsletter",
        fieldGroups: [],
        configuration: { language: "en" },
      },
      { name: "Newsletter [zh-CN]", language: "zh-cn" },
    );

    expect(definition.id).toBeUndefined();
    expect(definition.name).toBe("Newsletter [zh-CN]");
    expect(definition.createdAt).toBeInstanceOf(Date);
    expect(definition.updatedAt).toBeInstanceOf(Date);
    expect(definition.archived).toBe(false);
    expect(definition.configuration).toMatchObject({
      language: "zh-cn",
      embedType: HUBSPOT_FORM_V3_EMBED_TYPE,
    });
  });

  it("writes locale copies as V3 and drops visual-only fields", () => {
    const definition = formDefinitionForWrite(
      {
        name: "Newsletter",
        settings: { hubspotFormLocale: "en" },
        configuration: { language: "en", embedType: "V4" },
        layout: { nodes: [{ type: "step", id: 1 }] },
        elementsDefinition: {
          "15": { type: "submitButton", id: 15, text: "Submit" },
        },
      },
      { name: "Newsletter [zh-CN]", language: "zh-cn" },
    );

    expect(isNewEditorForm(definition)).toBe(false);
    expect(definition.configuration).toMatchObject({
      language: "zh-cn",
      embedType: HUBSPOT_FORM_V3_EMBED_TYPE,
    });
    expect(definition.settings).toBeUndefined();
    expect(definition.layout).toBeUndefined();
    expect(definition.elementsDefinition).toBeUndefined();
    expect(definition.displayOptions).toMatchObject({ submitButtonText: "Submit" });
  });

  it("lifts visual step and thank-you copy onto public V3 fields", () => {
    const definition = formDefinitionForWrite(
      {
        name: "Newsletter",
        configuration: {
          language: "en",
          embedType: "V4",
          postSubmitAction: { type: "thank_you", value: "" },
        },
        fieldGroups: [
          {
            groupType: "default_group",
            richTextType: "text",
            fields: [{ name: "email", label: "Email" }],
          },
        ],
        layout: {
          nodes: [
            { type: "step", id: 38, nodes: [{ id: 31 }] },
            { type: "postSubmitStep", id: 40, nodes: [{ id: 32 }] },
          ],
        },
        elementsDefinition: {
          "15": { type: "submitButton", id: 15, text: "Envoyer" },
          "31": { type: "richText", id: 31, html: "<p>Inscrivez-vous</p>" },
          "32": { type: "richText", id: 32, html: "<p>Merci</p>" },
        },
      },
      { name: "Newsletter [fr-FR]", language: "fr" },
    );

    expect(definition.displayOptions).toMatchObject({ submitButtonText: "Envoyer" });
    expect(definition.configuration?.postSubmitAction).toEqual({
      type: "thank_you",
      value: "<p>Merci</p>",
    });
    expect(definition.fieldGroups?.[0]?.richText).toBe("<p>Inscrivez-vous</p>");
    expect(definition.layout).toBeUndefined();
    expect(definition.elementsDefinition).toBeUndefined();
  });

  it("sets the body id to the locale copy when replacing a form", () => {
    const definition = formDefinitionForWrite(
      {
        id: "c81caeb1-4cc8-465c-9091-07061ef64b1b",
        name: "Newsletter",
        fieldGroups: [],
        configuration: { language: "en", embedType: "V4" },
      },
      {
        name: "Newsletter [zh-CN]",
        language: "zh-cn",
        id: "7c2accbe-a15b-407b-b5a8-8a376669b540",
      },
    );

    expect(definition.id).toBe("7c2accbe-a15b-407b-b5a8-8a376669b540");
    expect(definition.name).toBe("Newsletter [zh-CN]");
    expect(definition.configuration?.embedType).toBe(HUBSPOT_FORM_V3_EMBED_TYPE);
  });
});
