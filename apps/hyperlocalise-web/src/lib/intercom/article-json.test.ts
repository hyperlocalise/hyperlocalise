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
  articleFieldsToJsonPayload,
  assignIntercomArticleSourcePaths,
  collectApprovedIntercomArticleValues,
  buildIntercomArticleSourcePath,
  encodeIntercomLastPushRecord,
  hashIntercomArticleContent,
  hashIntercomTranslationValues,
  mergeIntercomLocalePushPayload,
  parseIntercomArticleMarkdown,
  parseIntercomLastPushRecord,
  serializeIntercomArticleMarkdown,
  shouldSkipUnchangedIntercomHash,
} from "./article-json";

describe("intercom article json", () => {
  it("builds a stable source path under the help center", () => {
    expect(
      buildIntercomArticleSourcePath({
        helpCenterId: "123",
        articleId: "456",
      }),
    ).toBe("intercom/123/456.md");
  });

  it("slugs help center and article names when present", () => {
    expect(
      buildIntercomArticleSourcePath({
        helpCenterId: "580669844",
        articleId: "17431620",
        helpCenterName: "Customer Support",
        articleTitle: "Reset your password",
      }),
    ).toBe("intercom/customer-support/reset-your-password.md");
  });

  it("reuses a persisted markdown source path for the same article", () => {
    const paths = assignIntercomArticleSourcePaths({
      helpCenterId: "123",
      helpCenterName: "Customer Support",
      articles: [{ id: "456", title: "Reset your password" }],
      existingMappings: [
        {
          articleId: "456",
          sourcePath: "intercom/customer-support/legacy-reset.md",
          status: "import_failed",
        },
      ],
    });

    expect(paths.get("456")).toBe("intercom/customer-support/legacy-reset.md");
  });

  it("remaps a persisted JSON source path to markdown", () => {
    const paths = assignIntercomArticleSourcePaths({
      helpCenterId: "123",
      helpCenterName: "Customer Support",
      articles: [{ id: "456", title: "Reset your password" }],
      existingMappings: [
        {
          articleId: "456",
          sourcePath: "intercom/customer-support/legacy-reset.json",
          status: "import_failed",
        },
      ],
    });

    expect(paths.get("456")).toBe("intercom/customer-support/reset-your-password.md");
  });

  it("disambiguates a new article that collides with a persisted filename", () => {
    const paths = assignIntercomArticleSourcePaths({
      helpCenterId: "123",
      helpCenterName: "Customer Support",
      articles: [{ id: "789", title: "Getting started" }],
      existingMappings: [
        {
          articleId: "456",
          sourcePath: "intercom/customer-support/getting-started.md",
          status: "active",
        },
      ],
    });

    expect(paths.get("789")).toBe("intercom/customer-support/getting-started-789.md");
  });

  it("disambiguates two new articles that slug to the same filename", () => {
    const paths = assignIntercomArticleSourcePaths({
      helpCenterId: "123",
      helpCenterName: "Customer Support",
      articles: [
        { id: "111", title: "Getting started" },
        { id: "222", title: "Getting started" },
      ],
    });

    expect(paths.get("111")).toBe("intercom/customer-support/getting-started.md");
    expect(paths.get("222")).toBe("intercom/customer-support/getting-started-222.md");
  });

  it("falls back to ids when names do not slug", () => {
    expect(
      buildIntercomArticleSourcePath({
        helpCenterId: "123",
        articleId: "456",
        helpCenterName: "!!!",
        articleTitle: "   ",
      }),
    ).toBe("intercom/123/456.md");
  });

  it("serializes title and description as frontmatter around the markdown body", () => {
    const markdown = serializeIntercomArticleMarkdown({
      title: "Hello",
      description: "Help",
      body: "Go to *Settings → Billing*.",
    });

    expect(markdown).toBe("---\ntitle: Hello\ndescription: Help\n---\nGo to *Settings → Billing*.");
    expect(parseIntercomArticleMarkdown(markdown)).toEqual({
      title: "Hello",
      description: "Help",
      body: "Go to *Settings → Billing*.",
    });
  });

  it("quotes frontmatter values that contain YAML special characters", () => {
    const markdown = serializeIntercomArticleMarkdown({
      title: "Reset: password",
      description: "",
      body: "Use **Forgot password**.",
    });

    expect(markdown).toBe(
      '---\ntitle: "Reset: password"\ndescription: ""\n---\nUse **Forgot password**.',
    );
    expect(parseIntercomArticleMarkdown(markdown)).toEqual({
      title: "Reset: password",
      description: "",
      body: "Use **Forgot password**.",
    });
  });

  it("hashes source and translation payloads the same way", () => {
    const payload = articleFieldsToJsonPayload({
      title: "Hello",
      description: "Help",
      body: "Go to *Settings → Billing*.",
    });

    expect(hashIntercomArticleContent(payload)).toBe(hashIntercomTranslationValues(payload));
    expect(hashIntercomTranslationValues(payload)).not.toBe(
      hashIntercomTranslationValues({ ...payload, title: "Hi" }),
    );
  });

  it("keeps last-push hashes backward compatible and stores per-locale timestamps", () => {
    const hash = hashIntercomTranslationValues({
      title: "Hello",
      description: "Help",
      body: "Go to *Settings → Billing*.",
    });

    expect(parseIntercomLastPushRecord(hash)).toEqual({
      hash,
      pushedAtSeconds: null,
    });
    expect(parseIntercomLastPushRecord(encodeIntercomLastPushRecord(hash, 1_672_317_851))).toEqual({
      hash,
      pushedAtSeconds: 1_672_317_851,
    });
  });

  it("lets overwrite resend an unchanged approved hash", () => {
    const hash = hashIntercomTranslationValues({
      title: "Hello",
      description: "Help",
      body: "Go to *Settings → Billing*.",
    });

    expect(
      shouldSkipUnchangedIntercomHash({
        lastHash: hash,
        nextHash: hash,
        overwriteIntercomDrafts: false,
      }),
    ).toBe(true);
    expect(
      shouldSkipUnchangedIntercomHash({
        lastHash: hash,
        nextHash: hash,
        overwriteIntercomDrafts: true,
      }),
    ).toBe(false);
  });

  it("requires approved title and body and preserves a remote description", () => {
    expect(
      mergeIntercomLocalePushPayload({
        approved: { title: "Hallo" },
        remote: { title: "Remote", description: "Hilfe", body: "Alt" },
      }),
    ).toBeNull();
    expect(
      mergeIntercomLocalePushPayload({
        approved: { title: "Hallo", body: "Neu" },
        remote: { title: "Remote", description: "Hilfe", body: "Alt" },
      }),
    ).toEqual({
      title: "Hallo",
      description: "Hilfe",
      body: "Neu",
    });
  });

  it("collects only approved article fields and drops whitespace-only values", () => {
    expect(
      collectApprovedIntercomArticleValues({
        title: "Hallo",
        description: "   ",
        body: "Neu",
        extra: "ignored",
      }),
    ).toEqual({
      title: "Hallo",
      body: "Neu",
    });
  });
});
