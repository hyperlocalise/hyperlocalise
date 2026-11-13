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
import { useEffect, useId, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { parseTagInput } from "@/components/content-editor/intelligence/content-editor-key-details";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { isValidLabelId } from "@/lib/projects/content-editor/content-editor-advanced-queue-filter";

import { contentEditorKeyTagsDialogMessages as messages } from "./content-editor-key-tags-dialog.messages";

/** The most tags one change adds or removes, as internal/keymeta allows. */
const maxTagsPerChange = 20;

/** Adds and removes tags on the ticked strings. */
export function ContentEditorKeyTagsDialog({
  open,
  onOpenChange,
  stringCount,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stringCount: number;
  onSave: (input: { addTags: string[]; removeTags: string[] }) => Promise<void>;
}) {
  const intl = useIntl();
  const addId = useId();
  const removeId = useId();
  const [add, setAdd] = useState("");
  const [remove, setRemove] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAdd("");
      setRemove("");
      setError(null);
    }
  }, [open]);

  const addTags = parseTagInput(add);
  const removeTags = parseTagInput(remove);

  async function save() {
    const all = [...addTags, ...removeTags];
    if (!all.every(isValidLabelId)) {
      setError(intl.formatMessage(messages.invalidTag));
      return;
    }
    if (addTags.length > maxTagsPerChange || removeTags.length > maxTagsPerChange) {
      setError(intl.formatMessage(messages.tooManyTags, { limit: maxTagsPerChange }));
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await onSave({ addTags, removeTags });
      onOpenChange(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message
          ? saveError.message
          : intl.formatMessage(messages.saveFailed),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.title} values={{ count: stringCount }} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.description} />
          </DialogDescription>
        </DialogHeader>
        <form
          id={`${addId}-form`}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={addId}>
              <FormattedMessage {...messages.addLabel} />
            </Label>
            <Input
              id={addId}
              value={add}
              autoFocus
              placeholder="release-7, checkout"
              disabled={isSaving}
              onChange={(event) => {
                setAdd(event.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={removeId}>
              <FormattedMessage {...messages.removeLabel} />
            </Label>
            <Input
              id={removeId}
              value={remove}
              disabled={isSaving}
              onChange={(event) => {
                setRemove(event.target.value);
                setError(null);
              }}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
          >
            <FormattedMessage {...messages.cancel} />
          </Button>
          <Button
            type="submit"
            form={`${addId}-form`}
            disabled={isSaving || addTags.length + removeTags.length === 0}
          >
            {isSaving ? <Spinner /> : null}
            <FormattedMessage {...messages.save} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
