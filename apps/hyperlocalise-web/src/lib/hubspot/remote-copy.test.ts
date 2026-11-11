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

import type { HubspotContentClient } from "./client";
import {
  buildEmailDocument,
  buildEmailHtmlDocument,
  buildFormDocument,
  serializeHubspotDocument,
} from "./document";
import { isHubspotRemoteCopyEmpty } from "./remote-copy";

function sourceForm() {
  return {
    displayOptions: { submitButtonText: "Send" },
    fieldGroups: [{ fields: [{ name: "email", label: "Email" }] }],
  };
}

function clientWith(overrides: Partial<HubspotContentClient>): HubspotContentClient {
  return overrides as HubspotContentClient;
}

describe("isHubspotRemoteCopyEmpty", () => {
  it("treats a form copy as empty when it still matches the imported source", async () => {
    const sourceText = serializeHubspotDocument(buildFormDocument(sourceForm()));
    const calls: string[] = [];
    const empty = await isHubspotRemoteCopyEmpty({
      client: clientWith({
        getForm: async (id) => {
          calls.push(id);
          return {
            id,
            name: "Newsletter [fr-FR]",
            language: "fr",
            updatedAt: null,
            definition: sourceForm(),
          };
        },
        getBlogPost: async () => {
          throw new Error("should_not_read_blog_posts_for_forms");
        },
      }),
      kind: "form",
      copyId: "form-copy",
      sourceText,
      sourceJson: JSON.parse(sourceText) as Record<string, unknown>,
    });

    expect(empty).toBe(true);
    expect(calls).toEqual(["form-copy"]);
  });

  it("treats a form copy as occupied once submit copy differs from the source", async () => {
    const sourceText = serializeHubspotDocument(buildFormDocument(sourceForm()));
    const empty = await isHubspotRemoteCopyEmpty({
      client: clientWith({
        getForm: async (id) => ({
          id,
          name: "Newsletter [fr-FR]",
          language: "fr",
          updatedAt: null,
          definition: {
            displayOptions: { submitButtonText: "Envoyer" },
            fieldGroups: [{ fields: [{ name: "email", label: "Courriel" }] }],
          },
        }),
      }),
      kind: "form",
      copyId: "form-copy",
      sourceText,
      sourceJson: JSON.parse(sourceText) as Record<string, unknown>,
    });

    expect(empty).toBe(false);
  });

  it("compares cloned emails against the imported HTML, not a blog post", async () => {
    const document = buildEmailDocument({
      subject: "Hello",
      widgets: { module: { body: "Welcome" } },
    });
    const sourceText = buildEmailHtmlDocument(document);
    const empty = await isHubspotRemoteCopyEmpty({
      client: clientWith({
        getEmail: async (id) => ({
          id,
          name: "Welcome [fr-FR]",
          language: "fr",
          subject: "Hello",
          widgets: { module: { body: "Welcome" } },
          styleSettings: {},
          updatedAt: null,
        }),
        getBlogPost: async () => {
          throw new Error("should_not_read_blog_posts_for_emails");
        },
      }),
      kind: "email",
      copyId: "email-copy",
      sourceText,
      sourceJson: null,
    });

    expect(empty).toBe(true);
  });
});
