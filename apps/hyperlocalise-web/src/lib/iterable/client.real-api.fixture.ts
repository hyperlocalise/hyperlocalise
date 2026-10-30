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
 * Documented Iterable payloads from
 * https://support.iterable.com/hc/en-us/articles/204780579-Iterable-API-Endpoints-and-Sample-Payloads
 */

import type {
  IterableEmailTemplate,
  IterableEmailTemplateUpdate,
  IterableEmailTemplateUpsert,
  IterableInAppTemplate,
  IterablePushTemplate,
  IterablePushTemplateUpdate,
  IterableSmsTemplate,
  IterableSmsTemplateUpdate,
  IterableSmsTemplateUpsert,
  IterableSnippetGetResponse,
  IterableSnippetListResponse,
  IterableSnippetPutRequest,
  IterableSnippetWriteResponse,
  IterableTemplateListResponse,
  IterableTemplatesByClientTemplateIdResponse,
} from "./client";

export const SAMPLE_TEMPLATES_LIST_EMAIL: IterableTemplateListResponse = {
  templates: [
    {
      templateId: 86596,
      createdAt: 1473368899828,
      updatedAt: 1473370111852,
      name: "Regular editor",
      creatorUserId: "user@example.com",
      messageTypeId: 3867,
    },
    {
      templateId: 68178,
      createdAt: 1466810056349,
      updatedAt: 1470431713441,
      name: "Photography Welcome Message",
      creatorUserId: "user@example.com",
      messageTypeId: 3866,
    },
  ],
};

export const SAMPLE_EMAIL_TEMPLATE_GET: IterableEmailTemplate = {
  templateId: 86596,
  name: "My name of template",
  fromName: "Customer Success",
  fromEmail: "user@example.com",
  replyToEmail: "replyTo@example.com",
  subject: "My Subject of message",
  preheaderText: "preheader message here",
  ccEmails: [],
  bccEmails: [],
  html: "<html>\n\n<head>\n<title></title>\n</head>\n\n<body>\n <p>\n {{userPropertyParameter}}\n </p>\n</body>\n\n</html>",
  plainText: "Optional plain text message",
  cacheDataFeed: false,
  mergeDataFeedContext: true,
  messageTypeId: 3867,
  creatorUserId: "user@example.com",
};

export const SAMPLE_EMAIL_TEMPLATE_UPSERT: IterableEmailTemplateUpsert = {
  clientTemplateId: 112233,
  name: "Lots of Cats",
  fromName: "Felicia the Cat",
  fromEmail: "user@example.com",
  replyToEmail: "replyTo@example.com",
  subject: "Rank These Cats",
  preheaderText: "10 out of 10!",
  html: "<html><body><p>So many cats!</p></body></html>",
};

export const SAMPLE_EMAIL_TEMPLATE_UPDATE: IterableEmailTemplateUpdate = {
  templateId: 53081,
  name: "Lots of Cats",
  fromName: "Felicia the Cat",
  fromEmail: "replyto@example.com",
  replyToEmail: "replyto@example.com",
  subject: "Rank These Cats",
  preheaderText: "10 out of 10!",
  html: "<html><body><p>So many cats!</p></body></html>",
};

export const SAMPLE_INAPP_TEMPLATE_GET: IterableInAppTemplate = {
  templateId: 0,
  name: "My In-App template",
  html: "<!DOCTYPE html>\n<html>\n<head>\n</head>\n<body>\n\n</body>\n</html>",
  inAppDisplaySettings: {
    top: { percentage: 0 },
    right: { percentage: 0 },
    bottom: { percentage: 0 },
    left: { percentage: 0 },
  },
  webInAppDisplaySettings: {
    position: "Full",
  },
  messageTypeId: 0,
  isDefaultLocale: true,
};

const SAMPLE_PUSH_BUTTON = {
  identifier: "string",
  title: "string",
  buttonType: "default",
  action: {
    type: "string",
    data: "string",
  },
  openApp: true,
  requiresUnlock: true,
  inputPlaceholder: "string",
  inputTitle: "string",
  actionIcon: {
    iconType: {},
    imageName: "string",
  },
};

export const SAMPLE_PUSH_TEMPLATE_GET: IterablePushTemplate = {
  templateId: 0,
  createdAt: "2022-09-29T17:23:42.748Z",
  updatedAt: "2022-09-29T17:23:42.748Z",
  name: "string",
  title: "string",
  message: "string",
  payload: {},
  badge: "string",
  wake: true,
  relevanceScore: 0,
  interruptionLevel: "passive",
  locale: "string",
  messageTypeId: 0,
  sound: "string",
  buttons: [SAMPLE_PUSH_BUTTON],
  deeplink: {
    ios: "string",
    android: "string",
  },
  richMedia: {
    ios: "string",
    android: "string",
  },
  dataFeedIds: [0],
  cacheDataFeed: true,
  mergeDataFeedContext: true,
  clientTemplateId: "string",
  campaignId: {},
  isSilentPush: true,
};

export const SAMPLE_PUSH_TEMPLATE_UPDATE: IterablePushTemplateUpdate = {
  templateId: 0,
  createdAt: "2022-09-29T17:23:42.683Z",
  updatedAt: "2022-09-29T17:23:42.683Z",
  name: "string",
  title: "string",
  message: "string",
  payload: {},
  badge: "string",
  wake: true,
  relevanceScore: 0,
  interruptionLevel: "passive",
  locale: "string",
  messageTypeId: 0,
  sound: "string",
  buttons: [SAMPLE_PUSH_BUTTON],
  deeplink: {
    ios: "string",
    android: "string",
  },
  richMedia: {
    ios: "string",
    android: "string",
  },
  dataFeedIds: [0],
  cacheDataFeed: true,
  mergeDataFeedContext: true,
  clientTemplateId: "string",
  campaignId: {},
  isSilentPush: true,
};

export const SAMPLE_SMS_TEMPLATE_UPSERT: IterableSmsTemplateUpsert = {
  clientTemplateId: 112233,
  name: "SMS Test",
  message: "Hello There!",
  locale: "en",
  messageTypeId: "1234",
};

export const SAMPLE_SMS_TEMPLATE_UPDATE: IterableSmsTemplateUpdate = {
  templateId: 123,
  name: "My SMS Title",
  message: "I like animals.",
  locale: "fr",
  messageTypeId: 531,
};

export const SAMPLE_SMS_TEMPLATE_GET: IterableSmsTemplate = {
  templateId: 100692,
  name: "SMS testing",
  message: "Here is example message",
  locale: "en",
  messageTypeId: 531,
};

export const SAMPLE_SNIPPETS_LIST: IterableSnippetListResponse = {
  snippets: [
    {
      id: 12345,
      name: "Copyright_year",
      content: "© 2025 Fiterable, Inc.",
      description: "Copyright year snippet",
      createdAt: "2025-01-01T10:00:00Z",
      updatedAt: "2025-01-15T14:30:00Z",
      createdBy: "user@example.com",
      updatedBy: "user2@example.com",
      projectId: 789,
    },
    {
      id: 12346,
      name: "Welcome_Banner",
      content: "<div style='background-color: {{bannerColor}};'>Welcome {{firstName}}!</div>",
      description: "Welcome banner with customizable color",
      variables: ["bannerColor", "firstName"],
      createdAt: "2025-01-01T10:00:00Z",
      updatedAt: "2025-01-15T14:30:00Z",
      createdBy: "user1@example.com",
      updatedBy: "user2@example.com",
      projectId: 789,
    },
  ],
};

export const SAMPLE_SNIPPET_GET: IterableSnippetGetResponse = {
  snippet: {
    id: 12345,
    name: "Welcome_Banner",
    content: "<div style='background-color: {{bannerColor}};'>Welcome {{firstName}}!</div>",
    description: "Welcome banner with customizable color",
    variables: ["bannerColor", "firstName"],
    createdAt: "2025-01-01T10:00:00Z",
    updatedAt: "2025-01-15T14:30:00Z",
    createdBy: "user1@example.com",
    updatedBy: "user2@example.com",
    projectId: 789,
  },
};

export const SAMPLE_SNIPPET_PUT: IterableSnippetPutRequest = {
  content:
    "<div style='background-color: {{bannerColor}};'>Welcome {{capitalize firstName}}!</div>",
  description: "Updated welcome banner with customizable color",
  variables: ["bannerColor", "firstName"],
};

export const SAMPLE_SNIPPET_PUT_RESPONSE: IterableSnippetWriteResponse = {
  snippetId: 12346,
};

export const SAMPLE_GET_BY_CLIENT_TEMPLATE_ID: IterableTemplatesByClientTemplateIdResponse = {
  templates: [SAMPLE_EMAIL_TEMPLATE_GET],
};
