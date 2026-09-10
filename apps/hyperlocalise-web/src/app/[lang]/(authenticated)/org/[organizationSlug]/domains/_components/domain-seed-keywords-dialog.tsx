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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DOMAIN_RESEARCH_MARKETS } from "@/lib/domains/research-prototype";

import { domainKeywordsViewMessages as messages } from "./domain-keywords-view.messages";
import { domainResearchSharedMessages as sharedMessages } from "./domain-research-shared.messages";

export function DomainSeedKeywordsDialog({
  open,
  defaultKeyword,
  defaultMarketId,
  pending = false,
  onOpenChange,
  onExpand,
}: {
  open: boolean;
  defaultKeyword: string;
  defaultMarketId: string;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onExpand?: (input: { keyword: string; marketId: string }) => Promise<boolean> | boolean;
}) {
  const intl = useIntl();
  const keywordId = useId();
  const marketId = useId();
  const [keyword, setKeyword] = useState(defaultKeyword);
  const [market, setMarket] = useState(defaultMarketId);

  useEffect(() => {
    if (open) {
      setKeyword(defaultKeyword);
      setMarket(defaultMarketId);
    }
  }, [defaultKeyword, defaultMarketId, open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onExpand) {
      const succeeded = await onExpand({ keyword, marketId: market });
      if (succeeded) {
        onOpenChange(false);
      }
      return;
    }
    toast.success(intl.formatMessage(messages.seedSuccess));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...messages.seedTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.seedDescription} />
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={keywordId}>
              <FormattedMessage {...messages.seedKeywordLabel} />
            </FieldLabel>
            <Input
              id={keywordId}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={intl.formatMessage(messages.seedKeywordPlaceholder)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={marketId}>
              <FormattedMessage {...messages.seedMarketLabel} />
            </FieldLabel>
            <Select
              value={market || null}
              onValueChange={(value) => {
                if (value) {
                  setMarket(value);
                }
              }}
            >
              <SelectTrigger id={marketId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOMAIN_RESEARCH_MARKETS.map((item) => (
                  <SelectItem key={item.id} value={item.id} label={item.label}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <FormattedMessage {...sharedMessages.cancel} />
            </Button>
            <Button type="submit" disabled={pending || !keyword.trim()}>
              <FormattedMessage {...messages.seedSubmit} />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
