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
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import { contentEditorKeyTranslateDialogMessages as messages } from "./content-editor-key-translate-dialog.messages";

/**
 * Starts AI translation of the ticked strings: a key job of kind translation, which fills
 * missing translations (or, if asked, unapproved ones) for review.
 */
export function ContentEditorKeyTranslateDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  sourceLocale,
  targetLocales,
  defaultLocale,
  stringIds,
  onStarted,
  onOpenJob,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
  /** The editor's language, ticked when the dialog opens. */
  defaultLocale: string;
  stringIds: string[];
  /** Called once the job is created, for example to clear the selection. */
  onStarted?: () => void;
  /** Opens the job's page, through the editor's leave guard. */
  onOpenJob: (href: string) => void;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [locales, setLocales] = useState<string[]>([]);
  const [overwriteUnapproved, setOverwriteUnapproved] = useState(false);
  const [pending, setPending] = useState(false);

  // Reset when the dialog opens, not on every render that passes a new locales array.
  const defaultsRef = useRef({ targetLocales, defaultLocale });
  defaultsRef.current = { targetLocales, defaultLocale };
  useEffect(() => {
    if (open) {
      const { targetLocales: all, defaultLocale: current } = defaultsRef.current;
      setLocales(all.includes(current) ? [current] : all);
      setOverwriteUnapproved(false);
    }
  }, [open]);

  const canSubmit = !pending && stringIds.length > 0 && locales.length > 0;

  async function submit() {
    setPending(true);
    try {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].jobs.$post({
        param: { organizationSlug, projectId },
        json: {
          type: "keys",
          kind: "translation",
          title: intl.formatMessage(messages.jobTitle, { count: stringIds.length }),
          keysInput: {
            sourceLocale,
            targetLocales: locales,
            stringIds,
            ...(overwriteUnapproved ? { overwriteUnapproved: true } : {}),
          },
        },
      });
      if (response.status !== 201) {
        throw new Error(await readApiError(response, intl.formatMessage(messages.failed)));
      }
      const body = (await response.json()) as { job: { id: string; keyCount?: number | null } };
      toast.success(
        intl.formatMessage(messages.started, { count: body.job.keyCount ?? stringIds.length }),
        {
          action: {
            label: intl.formatMessage(messages.openJob),
            onClick: () =>
              onOpenJob(
                `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(body.job.id)}`,
              ),
          },
        },
      );
      await queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] });
      onOpenChange(false);
      onStarted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.failed));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.title} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.description} values={{ count: stringIds.length }} />
          </DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">
            <FormattedMessage {...messages.languages} />
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {targetLocales.map((locale) => (
              <Label key={locale} className="flex items-center gap-2 font-normal">
                <Checkbox
                  checked={locales.includes(locale)}
                  onCheckedChange={(checked) =>
                    setLocales((current) =>
                      checked
                        ? targetLocales.filter((item) => item === locale || current.includes(item))
                        : current.filter((item) => item !== locale),
                    )
                  }
                />
                {locale}
              </Label>
            ))}
          </div>
        </fieldset>
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox
            checked={overwriteUnapproved}
            onCheckedChange={(checked) => setOverwriteUnapproved(checked === true)}
          />
          <FormattedMessage {...messages.overwriteUnapproved} />
        </Label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <FormattedMessage {...messages.cancel} />
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
            {pending ? <Spinner /> : null}
            <FormattedMessage {...messages.translate} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
