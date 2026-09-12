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
import {
  Field,
  FieldError,
  FieldLabel,
  FieldSet,
  FieldLegend,
  FieldGroup,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DOMAIN_RESEARCH_MARKETS,
  type DomainResearchDomain,
} from "@/lib/domains/research-prototype";

import { domainLinkDialogMessages as messages } from "./domain-link-dialog.messages";
import { domainResearchSharedMessages as sharedMessages } from "./domain-research-shared.messages";

export function DomainLinkDialog({
  open,
  onOpenChange,
  domain,
  existingDomains = [],
  onSave,
  onContinue,
  variant = "prototype",
}: {
  domain?: DomainResearchDomain;
  existingDomains?: DomainResearchDomain[];
  onSave?: (domain: DomainResearchDomain) => void;
  /** Live claim flow: continue with hostname only (no locale selection). */
  onContinue?: (domainKey: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: "prototype" | "live";
}) {
  const intl = useIntl();
  const hostnameId = useId();
  const marketId = useId();
  const [hostname, setHostname] = useState("");
  const [localeIds, setLocaleIds] = useState<string[]>([]);
  const [localeError, setLocaleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setHostname(domain?.domainKey ?? "");
      setLocaleIds(domain?.locales.map((locale) => locale.id) ?? []);
      setLocaleError(null);
      setError(null);
    }
  }, [open, domain]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextHostname = hostname.trim().toLowerCase();
    if (!nextHostname) {
      setError(intl.formatMessage(messages.hostnameRequired));
      return;
    }

    if (
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(nextHostname)
    ) {
      setError(intl.formatMessage(messages.hostnameInvalid));
      return;
    }
    if (existingDomains.some((item) => item.id !== domain?.id && item.domainKey === nextHostname)) {
      setError(intl.formatMessage(messages.hostnameDuplicate));
      return;
    }
    if (variant === "live" && !domain) {
      onContinue?.(nextHostname);
      onOpenChange(false);
      return;
    }
    const locales = DOMAIN_RESEARCH_MARKETS.filter((locale) => localeIds.includes(locale.id));
    if (!locales.length) {
      setLocaleError(intl.formatMessage(messages.localesRequired));
      return;
    }
    onSave?.(
      domain
        ? { ...domain, locales }
        : {
            id: `preview-${crypto.randomUUID()}`,
            domainKey: nextHostname,
            sourceUrl: `https://${nextHostname}`,
            locales,
            status: "pending_verification",
            keywordCount: 0,
            keywordCountLabel: "—",
            traffic: 0,
            trafficLabel: "—",
            score: null,
            trackedCount: 0,
            aiMentions: 0,
          },
    );
    toast.success(intl.formatMessage(domain ? messages.saved : messages.success));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...(domain ? messages.editTitle : messages.title)} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage
                {...(domain
                  ? messages.editDescription
                  : variant === "live"
                    ? messages.liveDescription
                    : messages.description)}
              />
            </DialogDescription>
          </DialogHeader>

          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={hostnameId}>
              <FormattedMessage {...messages.hostnameLabel} />
            </FieldLabel>
            <Input
              readOnly={Boolean(domain)}
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

          {variant === "prototype" ? (
            <>
              <FieldSet
                className="grid gap-3"
                aria-describedby={localeError ? `${marketId}-error` : undefined}
              >
                <FieldLegend variant="label">
                  <FormattedMessage {...messages.marketLabel} />
                </FieldLegend>
                <FieldGroup className="gap-3">
                  {DOMAIN_RESEARCH_MARKETS.map((locale) => (
                    <Field
                      key={locale.id}
                      orientation="horizontal"
                      data-invalid={Boolean(localeError)}
                    >
                      <Checkbox
                        id={`${marketId}-${locale.id}`}
                        checked={localeIds.includes(locale.id)}
                        aria-invalid={Boolean(localeError)}
                        onCheckedChange={(checked) => {
                          setLocaleIds((current) =>
                            checked
                              ? [...current, locale.id]
                              : current.filter((id) => id !== locale.id),
                          );
                          setLocaleError(null);
                        }}
                      />
                      <FieldLabel htmlFor={`${marketId}-${locale.id}`}>{locale.label}</FieldLabel>
                    </Field>
                  ))}
                </FieldGroup>
                <FieldError
                  id={`${marketId}-error`}
                  errors={localeError ? [{ message: localeError }] : undefined}
                />
              </FieldSet>
              <p className="text-sm text-muted-foreground">
                <FormattedMessage {...messages.prototypeNotice} />
              </p>
            </>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <FormattedMessage {...sharedMessages.cancel} />
            </Button>
            <Button type="submit">
              <FormattedMessage {...(domain ? messages.save : messages.submit)} />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
