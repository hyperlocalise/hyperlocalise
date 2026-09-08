"use client";

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
import { defineMessages } from "react-intl";

export const guidelinesBoardMockMessages = defineMessages({
  boardTitle: {
    defaultMessage: "Connected guidelines",
    id: 'VS0VH/0762',
    description: "Title of the connected guidelines file board",
  },
  boardSubtitle: {
    defaultMessage: "Drive, Notion, and SharePoint stay the source of truth",
    id: 'oNw/Do5A5A',
    description: "Subtitle of the connected guidelines file board",
  },
  driveName: {
    defaultMessage: "Google Drive",
    id: 'mhbklWULOm',
    description: "Google Drive source name on the guidelines board",
  },
  driveFile: {
    defaultMessage: "Brand-claims-policy.pdf",
    id: 'CQEmCrymE3',
    description: "Google Drive PDF filename on the guidelines board",
  },
  driveMeta: {
    defaultMessage: "PDF · 6 pages · Legal",
    id: 'BVHeBhvF9c',
    description: "Google Drive file metadata on the guidelines board",
  },
  notionName: {
    defaultMessage: "Notion",
    id: 'hzccK8c1vn',
    description: "Notion source name on the guidelines board",
  },
  notionFile: {
    defaultMessage: "Japan market notes",
    id: 'TZ3ud06CD+',
    description: "Notion page title on the guidelines board",
  },
  notionMeta: {
    defaultMessage: "Page · GTM · Updated this week",
    id: 'Oy/qd39Day',
    description: "Notion page metadata on the guidelines board",
  },
  sharepointName: {
    defaultMessage: "SharePoint",
    id: 'JC6yhq1JP6',
    description: "SharePoint source name on the guidelines board",
  },
  sharepointFile: {
    defaultMessage: "EU disclosures library",
    id: 'pFQ34kvcvg',
    description: "SharePoint library name on the guidelines board",
  },
  sharepointMeta: {
    defaultMessage: "Library · Compliance · 18 files",
    id: 'MjeUyFbT8y',
    description: "SharePoint library metadata on the guidelines board",
  },
  pdfTitle: {
    defaultMessage: "Brand & claims policy",
    id: 'iEesyqaQVt',
    description: "Title shown on the fake guidelines PDF",
  },
  pdfMeta: {
    defaultMessage: "Confidential · Page 2 of 6",
    id: 'o76L/3NXxQ',
    description: "Meta line on the fake guidelines PDF",
  },
  pdfIntro: {
    defaultMessage:
      "Use this policy when reviewing campaign copy. Agents must cite the clause that applies.",
    id: 'y/2/+8rxbw',
    description: "Intro paragraph on the fake guidelines PDF",
  },
  clauseHealthTitle: {
    defaultMessage: "2.1 Health claims",
    id: 'eXGK8mxaRF',
    description: "PDF clause title for health claims",
  },
  clauseHealthBody: {
    defaultMessage:
      'Do not use "clinically proven" or "klinisch erwiesen" unless the wording is on the approved claims list.',
    id: 'zEhmEZ0r+l',
    description: "PDF clause body for health claims",
  },
  clauseGermanTitle: {
    defaultMessage: "3.2 German advertising",
    id: '4xfa2MgxvC',
    description: "PDF clause title for German advertising",
  },
  clauseGermanBody: {
    defaultMessage:
      "Do not use superlatives such as einzigartig, beste, or sensationell in German ads.",
    id: 'VmCEhPgA0d',
    description: "PDF clause body for German advertising",
  },
  clauseAiTitle: {
    defaultMessage: "4.3 AI features",
    id: 'eZwaIz7tNc',
    description: "PDF clause title for AI disclosures",
  },
  clauseAiBody: {
    defaultMessage:
      "Pages that mention KI or AI must include the EU AI Act disclosure from this policy.",
    id: 'iCZtn2vyra',
    description: "PDF clause body for AI disclosures",
  },
  notionPreviewLabel: {
    defaultMessage: "Page preview",
    id: 'igXJErVret',
    description: "Label above the Notion guideline preview",
  },
  notionPreviewBody: {
    defaultMessage:
      "Lead with trust signals and social proof. Do not use aggressive discount language or urgency tactics.",
    id: 'UsjppO5ENO',
    description: "Body of the Notion guideline preview",
  },
  sharepointPreviewLabel: {
    defaultMessage: "Library preview",
    id: 'gWJIlIDF6/',
    description: "Label above the SharePoint guideline preview",
  },
  sharepointPreviewBody: {
    defaultMessage:
      "Approved EU AI Act disclosure, GDPR marketing claims, and health-claim wording live in this library.",
    id: 'X+8j5AXyLj',
    description: "Body of the SharePoint guideline preview",
  },
  chatTitle: {
    defaultMessage: "Guideline check",
    id: 'w8q/KN/ZqF',
    description: "Chat header title in the guidelines board mock",
  },
  chatEmptyTitle: {
    defaultMessage: "Check copy against the PDF",
    id: 'rPN3Y2jfH0',
    description: "Empty-state title in the guidelines board chat",
  },
  chatEmptySubtitle: {
    defaultMessage:
      "Ask the agent to read Brand-claims-policy.pdf and flag anything that breaks a clause.",
    id: 'pe8wOIBCi/',
    description: "Empty-state subtitle in the guidelines board chat",
  },
  chatSuggestion: {
    defaultMessage: "Review this German launch line",
    id: 'Dr6q7soTm3',
    description: "Suggestion button in the guidelines board chat",
  },
  chatPrompt: {
    defaultMessage:
      'Check this German launch line against Brand-claims-policy.pdf: "Unsere einzigartige KI-Plattform ist klinisch erwiesen."',
    id: '4p/SsmkJuR',
    description: "User prompt in the guidelines board chat",
  },
  chatCollapse: {
    defaultMessage: "Collapse",
    id: 'JY9Ed02KEb',
    description: "Accessible label to collapse the guidelines board chat",
  },
  chatClose: {
    defaultMessage: "Close",
    id: 'D2D16fgUkP',
    description: "Accessible label to close the guidelines board chat",
  },
  toolName: {
    defaultMessage: "Read guideline",
    id: 'SE8vhhcRvh',
    description: "Tool name while the agent reads the PDF",
  },
  toolDetail: {
    defaultMessage: "Brand-claims-policy.pdf · Google Drive",
    id: 'mgqDzjgTSc',
    description: "Tool detail while the agent reads the PDF",
  },
  replyIntro: {
    defaultMessage: "Three clauses in the Drive PDF are broken. Open a flag to see it in the file.",
    id: 'PZZ/+9b/45',
    description: "Agent reply intro after reading the PDF",
  },
  flagGermanTitle: {
    defaultMessage: "Superlative in DE copy",
    id: 'YZiaFZNuPi',
    description: "First compliance flag title",
  },
  flagGermanBody: {
    defaultMessage: '"einzigartige" is blocked by clause 3.2.',
    id: 'IW6zsfvtOy',
    description: "First compliance flag body",
  },
  flagHealthTitle: {
    defaultMessage: "Unapproved health claim",
    id: 'kvUTmvykXa',
    description: "Second compliance flag title",
  },
  flagHealthBody: {
    defaultMessage: '"klinisch erwiesen" is not on the approved list in clause 2.1.',
    id: '071psyOiAM',
    description: "Second compliance flag body",
  },
  flagAiTitle: {
    defaultMessage: "Missing AI disclosure",
    id: 'd2A2zGHowt',
    description: "Third compliance flag title",
  },
  flagAiBody: {
    defaultMessage: "Mentioning KI requires the EU AI Act wording in clause 4.3.",
    id: 'n3fs1Skt3S',
    description: "Third compliance flag body",
  },
  contextPill: {
    defaultMessage: "Brand-claims-policy.pdf",
    id: 'UgXh/JEfra',
    description: "Context chip in the guidelines board composer",
  },
  composerPlaceholder: {
    defaultMessage: "Ask to check another line against the connected files",
    id: '7eizbN+V+O',
    description: "Placeholder in the guidelines board composer after send",
  },
  send: {
    defaultMessage: "Send",
    id: 'h4qqRHFDUX',
    description: "Send button in the guidelines board chat",
  },
  replay: {
    defaultMessage: "Replay",
    id: 'qjnIHRqIL8',
    description: "Replay button in the guidelines board chat",
  },
  sourceAriaLabel: {
    defaultMessage: "Connected guideline sources",
    id: 'RNFkjkR2en',
    description: "Accessible label for the guidelines board file list",
  },
});
