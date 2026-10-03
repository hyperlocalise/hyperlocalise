"use client";
/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import type {
  CatStringGroup,
  CatStringGroupMember,
  CatStringGroupsQuery,
} from "@/lib/go-svc/go-svc-cat-groups.types";
import { useSyncCatSegmentTargetAfterSave } from "../project-file/use-content-editor-segment-target";

export function ContentEditorGroupApply({
  client,
  organizationSlug,
  projectId,
  group,
  query,
}: {
  client: GoSvcClient;
  organizationSlug: string;
  projectId: string;
  group: CatStringGroup;
  query: CatStringGroupsQuery;
}) {
  const intl = useIntl();
  const cache = useQueryClient();
  const syncTarget = useSyncCatSegmentTargetAfterSave();
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<CatStringGroupMember[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const fallback = intl.formatMessage({
    defaultMessage: "Could not apply the translation. Refresh the preview and try again.",
    id: "7MDcyx9w7R",
    description: "Bulk apply failure",
  });
  const preview = async () => {
    setBusy(true);
    setError(null);
    setMembers([]);
    setSelected(new Set());
    try {
      const all: CatStringGroupMember[] = [];
      for (let offset = 0; ; offset += 100) {
        const result = await client.cat.stringGroupMembers(organizationSlug, projectId, group.id, {
          ...query,
          groupSourceText: group.sourceText,
          offset,
          limit: 100,
        });
        if (result.pagination.totalCount > 200)
          throw new Error(
            intl.formatMessage({
              defaultMessage:
                "This group exceeds 200 occurrences. Narrow the file selection before applying.",
              id: "uA4aPFCbzK",
              description: "Bulk apply size limit",
            }),
          );
        all.push(...result.members);
        if (!result.pagination.hasMore) break;
      }
      setMembers(all);
      setSelected(new Set(all.map((member) => member.id)));
    } catch (err) {
      setError(goSvcErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };
  const chosen = members.filter((member) => selected.has(member.id));
  const locked = chosen.some((member) => member.isLocked);
  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await client.cat.applyStringGroup(organizationSlug, projectId, group.id, {
        sourceText: group.sourceText,
        targetLocale: query.targetLocale,
        text,
        members: chosen.map(({ id, sourceRevision, translationRevision }) => ({
          id,
          sourceRevision,
          translationRevision,
        })),
      });
      for (const member of result.members) {
        await syncTarget(
          {
            organizationSlug,
            projectId,
            sourcePath: member.sourcePath,
            targetLocale: query.targetLocale,
            externalStringId: member.id,
          },
          member.translation,
        );
      }
      await Promise.all(
        [
          "cat-string-groups",
          "cat-string-group-members",
          "project-file-content-editor-queue",
          "project-file-content-editor-segment-target",
          "content-editor-activity-logs",
        ].map((key) => cache.invalidateQueries({ queryKey: [key, organizationSlug, projectId] })),
      );
      setText("");
      setApplied(true);
      setOpen(false);
    } catch (err) {
      setError(goSvcErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
          setApplied(false);
          void preview();
        }}
      >
        <FormattedMessage
          defaultMessage="Apply translation"
          id="ipDmYrVUAi"
          description="Open group bulk apply"
        />
      </Button>
      {applied ? (
        <span role="status">
          <FormattedMessage
            defaultMessage="Translation applied."
            id="OZm0Z0home"
            description="Bulk apply success"
          />
        </span>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          if (
            !next &&
            text &&
            !window.confirm(
              intl.formatMessage({
                defaultMessage: "Discard this unsaved group translation?",
                id: "8rqAHC12Me",
                description: "Discard bulk translation confirmation",
              }),
            )
          )
            return;
          setOpen(next);
          if (!next) setText("");
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage
                defaultMessage="Apply translation to occurrences"
                id="fBLOKSEa5d"
                description="Bulk apply dialog title"
              />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage
                defaultMessage="Selected occurrences will be saved as drafts. Existing translations and approvals will be replaced. Locked occurrences must be explicitly deselected."
                id="J+oK+DpQfH"
                description="Bulk apply consequences"
              />
            </DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words">{group.sourceText}</p>
          <label className="flex flex-col gap-2">
            <span>{query.targetLocale}</span>
            <Textarea
              value={text}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          {busy ? (
            <p role="status">
              <FormattedMessage
                defaultMessage="Working…"
                id="aY0sGkAXN1"
                description="Bulk operation progress"
              />
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              <FormattedMessage
                defaultMessage="{count} selected of {total}"
                id="ofufgHayZx"
                description="Bulk selection count"
                values={{ count: chosen.length, total: members.length }}
              />
            </p>
            <Button variant="ghost" disabled={busy} onClick={() => void preview()}>
              <FormattedMessage
                defaultMessage="Refresh preview"
                id="/7eP2hUPXn"
                description="Reload bulk preview revisions"
              />
            </Button>
          </div>
          <ul className="flex flex-col gap-2">
            {members.map((member) => (
              <li key={member.id}>
                <label className="flex items-start gap-3 rounded-md border p-3">
                  <input
                    type="checkbox"
                    checked={selected.has(member.id)}
                    disabled={busy}
                    onChange={(event) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(member.id);
                        else next.delete(member.id);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0">
                    <span className="block break-all font-mono text-xs">
                      {member.sourcePath} · {member.key}
                    </span>
                    <span className="block whitespace-pre-wrap break-words">
                      {member.targetText || "—"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {member.status}
                      {member.isLocked
                        ? " · " +
                          intl.formatMessage({
                            defaultMessage: "Locked",
                            id: "wvqZbZUkjb",
                            description: "Bulk member lock status",
                          })
                        : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {locked ? (
            <p role="alert">
              <FormattedMessage
                defaultMessage="Deselect locked occurrences to continue."
                id="Y1hqf1Hg/+"
                description="Bulk apply lock blocker"
              />
            </p>
          ) : null}
          <Button
            disabled={busy || locked || chosen.length === 0 || !text.trim()}
            onClick={() => void apply()}
          >
            <FormattedMessage
              defaultMessage="Apply to {count} occurrences"
              id="tb7WyfEIlo"
              description="Commit bulk apply"
              values={{ count: chosen.length }}
            />
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
