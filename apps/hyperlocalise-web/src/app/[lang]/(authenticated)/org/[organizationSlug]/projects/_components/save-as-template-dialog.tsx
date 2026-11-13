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
"use client";

import { type FormEvent, useEffect, useId, useState } from "react";
import { FloppyDiskIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import type { ProjectListRow } from "./project-list";
import { saveAsTemplateDialogMessages as messages } from "./save-as-template-dialog.messages";

const TEMPLATE_NAME_MAX = 200;

/** Names a new project template that copies the project's settings and attachments. */
export function SaveAsTemplateDialog({
  project,
  isSaving,
  onOpenChange,
  onSave,
}: {
  project: ProjectListRow | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: { projectId: string; name: string }) => void;
}) {
  const intl = useIntl();
  const nameId = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setError(null);
    }
  }, [project]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(intl.formatMessage(messages.nameRequired));
      return;
    }
    if (trimmed.length > TEMPLATE_NAME_MAX) {
      setError(intl.formatMessage(messages.nameTooLong, { max: TEMPLATE_NAME_MAX }));
      return;
    }
    if (project) {
      onSave({ projectId: project.id, name: trimmed });
    }
  }

  return (
    <Dialog
      open={project !== null}
      onOpenChange={(open) => {
        if (!open && isSaving) {
          return;
        }
        onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...messages.title} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.description} />
            </DialogDescription>
          </DialogHeader>
          <Field className="gap-1.5">
            <FieldLabel htmlFor={nameId}>
              <FormattedMessage {...messages.nameLabel} />
            </FieldLabel>
            <Input
              id={nameId}
              value={name}
              disabled={isSaving}
              aria-invalid={Boolean(error)}
              onChange={(event) => setName(event.target.value)}
            />
            <FieldError errors={error ? [{ message: error }] : undefined} />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
            >
              <FormattedMessage {...messages.cancel} />
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Spinner /> : <FloppyDiskIcon />}
              <FormattedMessage {...messages.save} />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
