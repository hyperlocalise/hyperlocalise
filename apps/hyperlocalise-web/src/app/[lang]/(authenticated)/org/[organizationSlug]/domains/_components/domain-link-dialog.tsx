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
import { type FormEvent, useEffect, useId, useState } from "react";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DOMAIN_RESEARCH_MARKETS } from "@/lib/domains/research-prototype";

import { domainLinkDialogMessages as messages } from "./domain-link-dialog.messages";
import { domainResearchSharedMessages as sharedMessages } from "./domain-research-shared.messages";

export function DomainLinkDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const intl = useIntl();
  const hostnameId = useId();
  const marketId = useId();
  const [hostname, setHostname] = useState("");
  const [marketIdValue, setMarketIdValue] = useState(DOMAIN_RESEARCH_MARKETS[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setHostname("");
      setMarketIdValue(DOMAIN_RESEARCH_MARKETS[0]?.id ?? "");
      setError(null);
    }
  }, [open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextHostname = hostname.trim().toLowerCase();
    if (!nextHostname) {
      setError(intl.formatMessage(messages.hostnameRequired));
      return;
    }

    toast.success(intl.formatMessage(messages.success));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...messages.title} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.description} />
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor={hostnameId}>
              <FormattedMessage {...messages.hostnameLabel} />
            </FieldLabel>
            <Input
              id={hostnameId}
              value={hostname}
              onChange={(event) => {
                setHostname(event.target.value);
                setError(null);
              }}
              placeholder={intl.formatMessage(messages.hostnamePlaceholder)}
              aria-invalid={Boolean(error)}
              autoComplete="off"
            />
            <FieldError errors={error ? [{ message: error }] : undefined} />
          </Field>

          <Field>
            <FieldLabel htmlFor={marketId}>
              <FormattedMessage {...messages.marketLabel} />
            </FieldLabel>
            <Select
              value={marketIdValue || null}
              onValueChange={(value) => {
                if (value) {
                  setMarketIdValue(value);
                }
              }}
            >
              <SelectTrigger id={marketId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOMAIN_RESEARCH_MARKETS.map((market) => (
                  <SelectItem key={market.id} value={market.id} label={market.label}>
                    {market.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <FormattedMessage {...sharedMessages.cancel} />
            </Button>
            <Button type="submit">
              <FormattedMessage {...messages.submit} />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
