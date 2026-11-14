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
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Rows } from "@/components/ui/layout/rows";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { accountProfileFormMessages as messages } from "./account-profile-form.messages";
import { SettingsSectionHeader } from "./settings-page-chrome";

export function AccountProfileForm({
  email,
  firstName,
  lastName,
}: {
  email: string;
  firstName: string;
  lastName: string;
}) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  const [savedFirst, setSavedFirst] = useState(firstName);
  const [savedLast, setSavedLast] = useState(lastName);

  const saveMutation = useMutation({
    mutationFn: (next: { firstName: string; lastName: string }) =>
      client.account.updateProfile(next),
    onSuccess: (account) => {
      setSavedFirst(account.firstName ?? "");
      setSavedLast(account.lastName ?? "");
      setFirst(account.firstName ?? "");
      setLast(account.lastName ?? "");
    },
    onError: (error) => {
      setFirst(savedFirst);
      setLast(savedLast);
      toast.error(goSvcErrorMessage(error, intl.formatMessage(messages.saveError)));
    },
  });

  function persist(nextFirst: string, nextLast: string) {
    const trimmedFirst = nextFirst.trim();
    const trimmedLast = nextLast.trim();
    if (trimmedFirst === "") {
      setFirst(savedFirst);
      toast.error(intl.formatMessage(messages.firstNameRequired));
      return;
    }
    if (trimmedFirst === savedFirst && trimmedLast === savedLast) {
      setFirst(trimmedFirst);
      setLast(trimmedLast);
      return;
    }
    saveMutation.mutate({ firstName: trimmedFirst, lastName: trimmedLast });
  }

  return (
    <Rows spacing="3u">
      <SettingsSectionHeader
        title={intl.formatMessage(messages.sectionTitle)}
        description={intl.formatMessage(messages.sectionDescription)}
      />
      <Columns spacing="2u" collapseBelow="small">
        <Column width="1/2">
          <Field>
            <FieldLabel
              htmlFor="account-first-name"
              className="text-xs font-medium text-muted-foreground"
            >
              <FormattedMessage {...messages.firstName} />
            </FieldLabel>
            <Input
              id="account-first-name"
              value={first}
              disabled={saveMutation.isPending}
              onChange={(event) => setFirst(event.target.value)}
              onBlur={() => persist(first, last)}
              autoComplete="given-name"
            />
          </Field>
        </Column>
        <Column width="1/2">
          <Field>
            <FieldLabel
              htmlFor="account-last-name"
              className="text-xs font-medium text-muted-foreground"
            >
              <FormattedMessage {...messages.lastName} />
            </FieldLabel>
            <Input
              id="account-last-name"
              value={last}
              disabled={saveMutation.isPending}
              onChange={(event) => setLast(event.target.value)}
              onBlur={() => persist(first, last)}
              autoComplete="family-name"
            />
          </Field>
        </Column>
      </Columns>
      <Field>
        <FieldLabel htmlFor="account-email" className="text-xs font-medium text-muted-foreground">
          <FormattedMessage {...messages.email} />
        </FieldLabel>
        <Input id="account-email" readOnly value={email} className="h-10 bg-muted" />
      </Field>
    </Rows>
  );
}
