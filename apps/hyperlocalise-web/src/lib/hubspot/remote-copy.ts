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

import { buildBlogPostHtmlDocument } from "./blog-post-files";
import type { HubspotContentClient } from "./client";
import type { HubspotResourceKind } from "./constants";
import {
  buildBlogContentDocument,
  buildEmailDocument,
  buildEmailHtmlDocument,
  buildFormDocument,
  hashHubspotContent,
  serializeHubspotDocument,
} from "./document";

async function hashRemoteBlogPostHtml(
  client: HubspotContentClient,
  copyId: string,
): Promise<string> {
  const copy = await client.getBlogPost(copyId);
  let stylesCss = "";
  try {
    stylesCss = await client.collectBlogPostStylesCss({
      templatePath: copy.templatePath,
      attachedStylesheets: copy.attachedStylesheets,
    });
  } catch {
    stylesCss = "";
  }
  return hashHubspotContent(buildBlogPostHtmlDocument(copy, stylesCss));
}

/**
 * A remote locale copy counts as empty when it carries no translated content
 * yet: either it does not exist, or it is still identical to the imported
 * source (e.g. a freshly cloned email). Used by the `seed_empty` push policy
 * so pushes never overwrite copies that already hold locale content.
 */
export async function isHubspotRemoteCopyEmpty(input: {
  client: HubspotContentClient;
  kind: HubspotResourceKind;
  copyId: string;
  sourceText: string;
  sourceJson: Record<string, unknown> | null;
  blogPostHtml?: string | null;
}): Promise<boolean> {
  try {
    if (input.blogPostHtml) {
      return (
        hashHubspotContent(input.blogPostHtml) ===
        (await hashRemoteBlogPostHtml(input.client, input.copyId))
      );
    }
    if (input.kind === "email") {
      const copy = await input.client.getEmail(input.copyId);
      const document = buildEmailDocument({ subject: copy.subject, widgets: copy.widgets });
      const copyContent = input.sourceJson
        ? serializeHubspotDocument(document)
        : buildEmailHtmlDocument(document, { styleSettings: copy.styleSettings });
      return hashHubspotContent(copyContent) === hashHubspotContent(input.sourceText);
    }
    if (input.kind === "form") {
      const copy = await input.client.getForm(input.copyId);
      const copyContent = serializeHubspotDocument(buildFormDocument(copy.definition));
      return hashHubspotContent(copyContent) === hashHubspotContent(input.sourceText);
    }
    if (input.kind === "blog" && input.sourceJson) {
      const copy = await input.client.getBlogPost(input.copyId);
      const copyContent = serializeHubspotDocument(buildBlogContentDocument(copy));
      return hashHubspotContent(copyContent) === hashHubspotContent(input.sourceText);
    }
    return false;
  } catch {
    return false;
  }
}
