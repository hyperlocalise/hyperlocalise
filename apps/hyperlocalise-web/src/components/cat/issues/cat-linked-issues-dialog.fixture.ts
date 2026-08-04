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
import type { CatLinkedIssueSegmentContext } from "./cat-linked-issues-dialog";

export const catLinkedIssuesOrganizationSlug = "acme";
export const catLinkedIssuesProjectId = "project_website";
export const catLinkedIssuesTranslationKeyId = "11111111-1111-4111-8111-111111111111";

export const catLinkedIssuesSegmentFixture: CatLinkedIssueSegmentContext = {
  segmentId: catLinkedIssuesTranslationKeyId,
  segmentKey: "home.cta.save",
  sourceText: "Save changes",
  translationKeyId: catLinkedIssuesTranslationKeyId,
  targetLocale: "de-DE",
  sourcePath: "messages/home.json",
  linkUrl:
    "/org/acme/projects/project_website/files/cat?sourcePath=messages%2Fhome.json&locale=de-DE&segment=11111111-1111-4111-8111-111111111111",
  linkLabel: "Open in CAT",
};

export const catLinkedIssuesExternalSegmentFixture: CatLinkedIssueSegmentContext = {
  ...catLinkedIssuesSegmentFixture,
  segmentId: "ext-string-cta-save",
  translationKeyId: null,
  linkUrl: null,
};

export type CatLinkedIssueListItemFixture = {
  id: string;
  title: string;
  status: string;
  translationKeyId: string | null;
};

export const catLinkedIssuesListFixture: CatLinkedIssueListItemFixture[] = [
  {
    id: "issue_linked_001",
    title: "Context needed: home.cta.save",
    status: "open",
    translationKeyId: catLinkedIssuesTranslationKeyId,
  },
  {
    id: "issue_linked_002",
    title: "Source wording feels ambiguous",
    status: "in_progress",
    translationKeyId: catLinkedIssuesTranslationKeyId,
  },
];

export const catLinkableIssuesFixture: CatLinkedIssueListItemFixture[] = [
  ...catLinkedIssuesListFixture,
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

export const catLinkedIssuesAssignableMembersFixture = {
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
