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
import { isLoopsNotFoundError, selectLoopsCopyByName, type LoopsClient } from "./client";

export type ResolvedTransactionalCopy = {
  copyId: string;
  draftEmailMessageId: string | null;
  expectedRevisionId: string | null;
};

export type ResolvedCampaignCopy = {
  copyId: string;
  emailMessageId: string | null;
  expectedRevisionId: string | null;
};

type CopyResolutionInput = {
  client: LoopsClient;
  /** Copy id recorded by a previous push, if any. */
  storedCopyId?: string;
  /** Expected `{source} [{locale}]` copy name. */
  copyName: string;
  pushWarning: (message: string) => void;
};

function duplicateCopiesWarning(copyName: string, duplicateCount: number): string {
  return (
    `${copyName}: found ${duplicateCount + 1} copies in Loops; ` +
    "reusing the newest — delete the extras in the Loops dashboard"
  );
}

async function loadTransactionalDraft(
  client: LoopsClient,
  copyId: string,
): Promise<{ draftEmailMessageId: string | null; expectedRevisionId: string | null } | null> {
  try {
    const draft = await client.ensureTransactionalDraft(copyId);
    return {
      draftEmailMessageId: draft.draftEmailMessageId,
      expectedRevisionId: draft.draftEmailMessageContentRevisionId,
    };
  } catch (error) {
    if (!isLoopsNotFoundError(error)) {
      throw error;
    }
    // The copy was deleted in Loops after its id was recorded.
    return null;
  }
}

async function loadCampaignMessage(
  client: LoopsClient,
  copyId: string,
): Promise<{ emailMessageId: string | null; expectedRevisionId: string | null } | null> {
  try {
    const campaign = await client.getCampaign(copyId);
    const emailMessageId = campaign.emailMessageId;
    if (!emailMessageId) {
      return null;
    }
    const message = await client.getEmailMessage(emailMessageId);
    return { emailMessageId, expectedRevisionId: message.contentRevisionId };
  } catch (error) {
    if (!isLoopsNotFoundError(error)) {
      throw error;
    }
    // The copy (or its email message) was deleted in Loops.
    return null;
  }
}

/**
 * Resolve the transactional locale copy to update. Prefers the stored id,
 * then adopts a same-named copy already in Loops (never creating a duplicate),
 * and only creates when nothing exists.
 */
export async function resolveTransactionalCopy(
  input: CopyResolutionInput,
): Promise<ResolvedTransactionalCopy> {
  const tried = new Set<string>();
  if (input.storedCopyId) {
    tried.add(input.storedCopyId);
    const draft = await loadTransactionalDraft(input.client, input.storedCopyId);
    if (draft) {
      return { copyId: input.storedCopyId, ...draft };
    }
  }
  const listed = await input.client.listTransactionalEmails();
  const { match, duplicateCount } = selectLoopsCopyByName(listed, input.copyName);
  if (match && !tried.has(match.id)) {
    if (duplicateCount > 0) {
      input.pushWarning(duplicateCopiesWarning(input.copyName, duplicateCount));
    }
    const draft = await loadTransactionalDraft(input.client, match.id);
    if (draft) {
      return { copyId: match.id, ...draft };
    }
  } else if (duplicateCount > 0) {
    input.pushWarning(duplicateCopiesWarning(input.copyName, duplicateCount));
  }
  const created = await input.client.createTransactionalEmail(input.copyName);
  return {
    copyId: created.id,
    draftEmailMessageId: created.draftEmailMessageId,
    expectedRevisionId: created.draftEmailMessageContentRevisionId,
  };
}

/**
 * Resolve the campaign locale copy to update. Same adopt-before-create policy
 * as transactional copies, except a same-named campaign whose email content is
 * missing cannot be repaired through the API (no delete endpoint), so it fails
 * with an actionable message instead of stacking another duplicate.
 */
export async function resolveCampaignCopy(
  input: CopyResolutionInput,
): Promise<ResolvedCampaignCopy> {
  const tried = new Set<string>();
  if (input.storedCopyId) {
    tried.add(input.storedCopyId);
    const loaded = await loadCampaignMessage(input.client, input.storedCopyId);
    if (loaded) {
      return { copyId: input.storedCopyId, ...loaded };
    }
  }
  const listed = await input.client.listCampaigns();
  const { match, duplicateCount } = selectLoopsCopyByName(listed, input.copyName);
  if (match && !tried.has(match.id)) {
    if (duplicateCount > 0) {
      input.pushWarning(duplicateCopiesWarning(input.copyName, duplicateCount));
    }
    const loaded = await loadCampaignMessage(input.client, match.id);
    if (loaded) {
      return { copyId: match.id, ...loaded };
    }
    input.pushWarning(
      `${input.copyName}: exists in Loops but its email content is missing; ` +
        "delete it in the Loops dashboard and re-push",
    );
    throw new Error("loops_copy_message_missing");
  }
  if (duplicateCount > 0) {
    input.pushWarning(duplicateCopiesWarning(input.copyName, duplicateCount));
  }
  const created = await input.client.createCampaign(input.copyName);
  return {
    copyId: created.id,
    emailMessageId: created.emailMessageId,
    expectedRevisionId: created.emailMessageContentRevisionId,
  };
}
