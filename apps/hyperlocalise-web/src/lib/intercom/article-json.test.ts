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
  buildIntercomArticleSourcePath,
  encodeIntercomLastPushRecord,
  hashIntercomArticleContent,
  hashIntercomTranslationValues,
  mergeIntercomLocalePushPayload,
  parseIntercomLastPushRecord,
  serializeIntercomArticleJson,
  shouldSkipUnchangedIntercomHash,
} from "./article-json";

describe("intercom article json", () => {
  it("builds a stable source path under the help center", () => {
    expect(
      buildIntercomArticleSourcePath({
        helpCenterId: "123",
        articleId: "456",
      }),
    ).toBe("intercom/123/456.json");
  });

  it("serializes only title, description, and body", () => {
    const json = serializeIntercomArticleJson({
      title: "Hello",
      description: "Help",
      body: "<p>Body</p>",
    });

    expect(JSON.parse(json)).toEqual({
      title: "Hello",
      description: "Help",
      body: "<p>Body</p>",
    });
  });

  it("hashes source and translation payloads the same way", () => {
    const payload = articleFieldsToJsonPayload({
      title: "Hello",
      description: "Help",
      body: "<p>Body</p>",
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
      body: "<p>Body</p>",
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
      body: "<p>Body</p>",
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
        remote: { title: "Remote", description: "Hilfe", body: "<p>Alt</p>" },
      }),
    ).toBeNull();
    expect(
      mergeIntercomLocalePushPayload({
        approved: { title: "Hallo", body: "<p>Neu</p>" },
        remote: { title: "Remote", description: "Hilfe", body: "<p>Alt</p>" },
      }),
    ).toEqual({
      title: "Hallo",
      description: "Hilfe",
      body: "<p>Neu</p>",
    });
  });
});
