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
import { http, HttpResponse } from "msw";

export const CAT_STORY_DOCUMENT_SOURCE_URL = "/storybook/cat/content/intro.source.md";
export const CAT_STORY_DOCUMENT_TARGET_URL = "/storybook/cat/content/intro.target.md";
export const CAT_STORY_DOCUMENT_MDX_SOURCE_URL = "/storybook/cat/content/guide.source.mdx";
export const CAT_STORY_DOCUMENT_MDX_TARGET_URL = "/storybook/cat/content/guide.target.mdx";
export const CAT_STORY_DOCUMENT_ERROR_TARGET_URL = "/storybook/cat/content/missing.target.md";

export const catStoryDocumentSourceMarkdown = `---
title: Getting started
description: Intro to the product
---

# Getting started

Welcome to the product guide.

Use the dashboard to review translations.
`;

export const catStoryDocumentTargetMarkdown = `---
title: Bắt đầu
description: Giới thiệu sản phẩm
---

# Bắt đầu

Chào mừng bạn đến với hướng dẫn sản phẩm.

Sử dụng bảng điều khiển để xem xét bản dịch.
`;

export const catStoryDocumentMdxSourceMarkdown = `---
title: Component guide
---

# Component guide

<Callout type="info">Keep JSX intact when translating.</Callout>

Press <kbd>Esc</kbd> to cancel.
`;

export const catStoryDocumentMdxTargetMarkdown = `---
title: Hướng dẫn thành phần
---

# Hướng dẫn thành phần

<Callout type="info">Giữ nguyên JSX khi dịch.</Callout>

Nhấn <kbd>Esc</kbd> để hủy.
`;

function markdownResponse(text: string) {
  return new HttpResponse(text, {
    status: 200,
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export const contentEditorDocumentMswHandlers = [
  http.get(CAT_STORY_DOCUMENT_SOURCE_URL, () => markdownResponse(catStoryDocumentSourceMarkdown)),
  http.get(CAT_STORY_DOCUMENT_TARGET_URL, () => markdownResponse(catStoryDocumentTargetMarkdown)),
  http.get(CAT_STORY_DOCUMENT_MDX_SOURCE_URL, () =>
    markdownResponse(catStoryDocumentMdxSourceMarkdown),
  ),
  http.get(CAT_STORY_DOCUMENT_MDX_TARGET_URL, () =>
    markdownResponse(catStoryDocumentMdxTargetMarkdown),
  ),
  http.get(
    CAT_STORY_DOCUMENT_ERROR_TARGET_URL,
    () => new HttpResponse("not found", { status: 404 }),
  ),
];
