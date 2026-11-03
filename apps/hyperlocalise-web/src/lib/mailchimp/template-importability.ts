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

import type { MailchimpTemplateSummary } from "./client";

export function isMailchimpTemplateImportable(template: MailchimpTemplateSummary): boolean {
  if (template.type !== "user") {
    return false;
  }
  if (template.active === false) {
    return false;
  }
  if (template.content_type === "multichannel" || template.content_type === "template") {
    return false;
  }
  if (template.drag_and_drop === true && template.content_type !== "html") {
    return false;
  }
  return true;
}

export function mailchimpTemplateSkipReason(template: MailchimpTemplateSummary): string | null {
  if (template.type !== "user") {
    return "Mailchimp gallery template";
  }
  if (template.active === false) {
    return "inactive in Mailchimp";
  }
  if (
    template.content_type === "multichannel" ||
    template.content_type === "template" ||
    (template.drag_and_drop === true && template.content_type !== "html")
  ) {
    return "drag-and-drop (import campaigns or HTML templates instead)";
  }
  return null;
}

export function summarizeMailchimpUnsupportedTemplates(
  items: ReadonlyArray<{ name: string }>,
): string | null {
  if (items.length === 0) {
    return null;
  }
  if (items.length === 1) {
    const name = items[0]?.name.trim() || "Template";
    return `${name} is drag-and-drop — import the campaign instead.`;
  }
  return `${items.length} drag-and-drop templates can't be imported — use campaigns or code-your-own HTML templates.`;
}
