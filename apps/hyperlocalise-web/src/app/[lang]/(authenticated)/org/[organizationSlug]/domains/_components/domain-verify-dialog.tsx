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
import { Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DOMAIN_RESEARCH_VERIFY_RECORD } from "@/lib/domains/research-prototype";

import { domainResearchSharedMessages as sharedMessages } from "./domain-research-shared.messages";
import { domainVerifyDialogMessages as messages } from "./domain-verify-dialog.messages";

export function DomainVerifyDialog({
  open,
  domainKey,
  onOpenChange,
}: {
  open: boolean;
  domainKey: string;
  onOpenChange: (open: boolean) => void;
}) {
  const intl = useIntl();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(DOMAIN_RESEARCH_VERIFY_RECORD.value);
      toast.success(intl.formatMessage(sharedMessages.copied));
    } catch {
      toast.success(intl.formatMessage(messages.success));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.title} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.description} values={{ domain: domainKey }} />
          </DialogDescription>
        </DialogHeader>

        <dl className="grid gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <div className="grid gap-1 sm:grid-cols-[6rem_1fr] sm:items-center">
            <dt className="text-muted-foreground">
              <FormattedMessage {...messages.hostLabel} />
            </dt>
            <dd className="font-mono text-foreground">{DOMAIN_RESEARCH_VERIFY_RECORD.host}</dd>
          </div>
          <div className="grid gap-1 sm:grid-cols-[6rem_1fr] sm:items-center">
            <dt className="text-muted-foreground">
              <FormattedMessage {...messages.typeLabel} />
            </dt>
            <dd className="font-mono text-foreground">{DOMAIN_RESEARCH_VERIFY_RECORD.type}</dd>
          </div>
          <div className="grid gap-1 sm:grid-cols-[6rem_1fr] sm:items-center">
            <dt className="text-muted-foreground">
              <FormattedMessage {...messages.valueLabel} />
            </dt>
            <dd className="flex min-w-0 items-center gap-2">
              <code className="min-w-0 truncate font-mono text-foreground">
                {DOMAIN_RESEARCH_VERIFY_RECORD.value}
              </code>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                onClick={() => {
                  void handleCopy();
                }}
              >
                <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.8} />
                <span className="sr-only">
                  <FormattedMessage {...messages.copyValue} />
                </span>
              </Button>
            </dd>
          </div>
        </dl>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <FormattedMessage {...sharedMessages.cancel} />
          </Button>
          <Button
            type="button"
            onClick={() => {
              toast.success(intl.formatMessage(messages.success));
              onOpenChange(false);
            }}
          >
            <FormattedMessage {...messages.check} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
