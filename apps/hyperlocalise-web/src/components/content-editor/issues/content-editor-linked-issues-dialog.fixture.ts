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
import type { ContentEditorLinkedIssueSegmentContext } from "./content-editor-linked-issues-dialog";

export const contentEditorLinkedIssuesOrganizationSlug = "acme";
export const contentEditorLinkedIssuesProjectId = "project_website";
export const contentEditorLinkedIssuesTranslationKeyId = "11111111-1111-4111-8111-111111111111";

export const contentEditorLinkedIssuesSegmentFixture: ContentEditorLinkedIssueSegmentContext = {
  segmentId: contentEditorLinkedIssuesTranslationKeyId,
  segmentKey: "home.cta.save",
  sourceText: "Save changes",
  translationKeyId: contentEditorLinkedIssuesTranslationKeyId,
  targetLocale: "de-DE",
  sourcePath: "messages/home.json",
};

export const contentEditorLinkedIssuesExternalSegmentFixture: ContentEditorLinkedIssueSegmentContext =
  {
    ...contentEditorLinkedIssuesSegmentFixture,
    segmentId: "ext-string-cta-save",
    translationKeyId: null,
  };

export type ContentEditorLinkedIssueListItemFixture = {
  id: string;
  title: string;
  status: string;
  translationKeyId: string | null;
};

export const contentEditorLinkedIssuesListFixture: ContentEditorLinkedIssueListItemFixture[] = [
  {
    id: "issue_linked_001",
    title: "Context needed: home.cta.save",
    status: "open",
    translationKeyId: contentEditorLinkedIssuesTranslationKeyId,
  },
  {
    id: "issue_linked_002",
    title: "Source wording feels ambiguous",
    status: "in_progress",
    translationKeyId: contentEditorLinkedIssuesTranslationKeyId,
  },
];

export const contentEditorLinkableIssuesFixture: ContentEditorLinkedIssueListItemFixture[] = [
  ...contentEditorLinkedIssuesListFixture,
  {
    id: "issue_unlinked_001",
    title: "Checkout pay button too long",
    status: "open",
    translationKeyId: null,
  },
  {
    id: "issue_unlinked_002",
    title: "Hero headline length check",
    status: "resolved",
    translationKeyId: null,
  },
];

export const contentEditorLinkedIssuesAssignableMembersFixture = {
  members: [
    {
      userId: "user_mina",
      workosUserId: "workos_mina",
      email: "mina@example.com",
      firstName: "Mina",
      lastName: "Chen",
      displayName: "Mina Chen",
      avatarUrl: null,
      isCurrentUser: true,
    },
  ],
};
