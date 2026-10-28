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

/**
 * Redacted snapshots of live Customer.io Design Studio API responses (US
 * region, captured 2026-10-28) used as test fixtures. Long `html` strings
 * are truncated with a `__truncated` marker; all ids, names, language tags,
 * and response shapes are faithful to the live payloads.
 *
 * Notable live shapes:
 * - Emails linked to campaign 1 actions use the `"<campaign>: <action>"`
 *   name and expose `available_languages: ["zh-cn"]` (lowercase).
 * - Default email content is component markup (`<x-base><x-section>…`), not
 *   the compiled HTML the App API returns for the same action.
 * - Single-translation GET wraps in `{email_translation: {...}}` with the
 *   same content/envelope/transformers shape as the default email.
 */

export const REAL_DESIGN_STUDIO_EMAILS_LIST = {
  emails: [
    {
      id: "8e952ff8-7c7f-46c0-a335-332f35bfcd3c",
      name: "Test",
      is_template: false,
      is_linked: true,
      has_translations: false,
      parent_folder_id: null,
      created: 1793114018,
      updated: 1793114024,
    },
    {
      id: "31488f77-b1d5-4256-ad6e-c049deff19c5",
      name: "Untitled Automation 1: 10 Reasons to Upgrade",
      is_template: false,
      is_linked: true,
      has_translations: true,
      parent_folder_id: null,
      created: 1793114784,
      updated: 1793157688,
    },
    {
      id: "74693d36-043c-4814-9f30-e3edb4f8b401",
      name: "Untitled Automation 1: Welcome to MyApp",
      is_template: false,
      is_linked: true,
      has_translations: true,
      parent_folder_id: null,
      created: 1793115048,
      updated: 1793115193,
    },
  ],
  folders: [],
  meta: {
    pagination: { limit: 1000, page: 1, total: 3 },
    filters: {},
  },
};

export const REAL_DESIGN_STUDIO_EMAIL_DETAIL = {
  email: {
    available_languages: ["zh-cn"],
    content: {
      amp: "",
      html: '<x-base>\n<x-section data-layer-label="Header">\n<x-heading-1>Welcome! Confirm your email</x-heading-1>\n__truncated__\n</x-base>',
      preheader_text: "",
      subject: "Untitled Automation 1: 10 Reasons to Upgrade",
      text: "",
    },
    created: 1793114784,
    envelope: {
      bcc: "",
      cc: "",
      fake_bcc: false,
      from: "",
      from_id: null,
      headers: [],
      recipient: "",
      reply_to: "",
      reply_to_id: null,
    },
    id: "31488f77-b1d5-4256-ad6e-c049deff19c5",
    is_linked: true,
    is_template: false,
    name: "Untitled Automation 1: 10 Reasons to Upgrade",
    parent_folder_id: null,
    transformers: {},
    updated: 1793157688,
  },
};

export const REAL_DESIGN_STUDIO_TRANSLATIONS_LIST = {
  email_translations: [
    {
      language_group_id: "31488f77-b1d5-4256-ad6e-c049deff19c5",
      is_template: false,
      is_linked: true,
      parent_folder_id: null,
      language: "zh-cn",
      available_languages: ["zh-cn"],
      created: 1793157688,
      updated: 1793157688,
      content: {
        subject: "Untitled Automation 1: 10 Reasons to Upgrade",
        preheader_text: "",
        html: '<x-base>\n<x-section data-layer-label="Header">\n<x-heading-1>Welcome! Confirm your email</x-heading-1>\n__truncated__\n</x-base>',
      },
    },
  ],
};

export const REAL_DESIGN_STUDIO_TRANSLATION_ZH_CN = {
  email_translation: {
    language_group_id: "31488f77-b1d5-4256-ad6e-c049deff19c5",
    is_template: false,
    is_linked: true,
    parent_folder_id: null,
    language: "zh-cn",
    available_languages: ["zh-cn"],
    created: 1793157688,
    updated: 1793157688,
    content: {
      subject: "Untitled Automation 1: 10 Reasons to Upgrade",
      preheader_text: "",
      html: '<x-base>\n<x-section data-layer-label="Header">\n<x-heading-1>Welcome! Confirm your email</x-heading-1>\n__truncated__\n</x-base>',
    },
    envelope: {
      bcc: "",
      cc: "",
      fake_bcc: false,
      from: "",
      from_id: null,
      headers: [],
      recipient: "",
      reply_to: "",
      reply_to_id: null,
    },
    transformers: {},
  },
};
