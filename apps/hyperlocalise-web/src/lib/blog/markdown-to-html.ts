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
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

import type { AppLocale } from "@/lib/app-i18n/locales";

import { remarkLocalizeMarketingLinks } from "./remark-localize-marketing-links";

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "table", "thead", "tbody", "tr", "th", "td"],
};

export type MarkdownToHtmlOptions = {
  locale?: AppLocale;
};

export async function markdownToHtml(markdown: string, options?: MarkdownToHtmlOptions) {
  const processor = remark().use(remarkGfm);

  if (options?.locale) {
    processor.use(remarkLocalizeMarketingLinks(options.locale));
  }

  const result = await processor
    .use(remarkRehype)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify)
    .process(markdown);

  return result.toString();
}
