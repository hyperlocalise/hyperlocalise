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
 * Sample Iterable REST response bodies aligned with Iterable’s documented
 * Templates and Snippets API shapes:
 * https://support.iterable.com/hc/en-us/articles/204780579-Iterable-API-Endpoints-and-Sample-Payloads
 *
 * Values are synthetic; field names and nesting match the public samples.
 */

export const SAMPLE_TEMPLATES_LIST_EMAIL = {
  templates: [
    {
      templateId: 938631,
      name: "Welcome email",
      messageMedium: "Email",
      updatedAt: "2024-01-15T12:00:00.000Z",
    },
  ],
  nextPageUrl: null,
};

export const SAMPLE_EMAIL_TEMPLATE_GET = {
  template: {
    templateId: 938631,
    name: "Welcome email",
    subject: "Welcome, {{firstName}}!",
    preheaderText: "Thanks for joining",
    html: "<html><body><p>Hello {{firstName}}</p></body></html>",
    plainText: "Hello {{firstName}}",
    locale: "en-US",
    editorType: "Visual",
    updatedAt: "2024-01-15T12:00:00.000Z",
  },
};

export const SAMPLE_EMAIL_TEMPLATE_GET_FR = {
  template: {
    templateId: 938631,
    name: "Welcome email",
    subject: "Bienvenue, {{firstName}}!",
    preheaderText: "Merci de nous avoir rejoint",
    html: "<html><body><p>Bonjour {{firstName}}</p></body></html>",
    plainText: "Bonjour {{firstName}}",
    locale: "fr-FR",
    editorType: "Visual",
  },
};

export const SAMPLE_INAPP_TEMPLATE_GET = {
  template: {
    templateId: 441022,
    name: "Promo in-app",
    html: "<html><body><p>Sale ends today</p></body></html>",
    title: "Limited offer",
    subtitle: "Tap to shop",
    icon: "https://example.com/icon.png",
    locale: "en-US",
    editorType: "Visual",
    inboxMetadata: {
      title: "Limited offer",
      subtitle: "Tap to shop",
      icon: "https://example.com/icon.png",
      saveToInbox: true,
    },
  },
};

export const SAMPLE_PUSH_TEMPLATE_GET = {
  template: {
    templateId: 552001,
    name: "Order shipped",
    title: "Your order is on the way",
    message: "Track package #{{orderId}}",
    locale: "en-US",
  },
};

export const SAMPLE_SMS_TEMPLATE_GET = {
  template: {
    templateId: 663002,
    name: "OTP",
    message: "Your code is {{code}}",
    locale: "en-US",
  },
};

export const SAMPLE_SNIPPETS_LIST = {
  snippets: [
    {
      id: 12001,
      name: "Welcome_Banner",
      updatedAt: "2024-02-01T08:00:00.000Z",
    },
  ],
};

export const SAMPLE_SNIPPET_GET = {
  id: 12001,
  name: "Welcome_Banner",
  content: '<div>{{ snippet "Footer" }}</div>',
  variables: ["Footer"],
  updatedAt: "2024-02-01T08:00:00.000Z",
};

export const SAMPLE_UPSERT_ACK = {
  msg: "Upserted 1 templates",
  code: "Success",
  params: null,
};

export const SAMPLE_GET_BY_CLIENT_TEMPLATE_ID = {
  template: {
    templateId: 938999,
    name: "Welcome email (HL localized)",
    clientTemplateId: "hl-iterable-938631",
    messageMedium: "Email",
  },
};
