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
import { FormattedMessage, useIntl } from "react-intl";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Rows } from "@/components/ui/layout/rows";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TypographyP } from "@/components/ui/typography";
import type { UserNotificationEmailFormat } from "@/lib/database/schema/issue-sheet";

import { notificationPreferencesFormMessages as messages } from "./notification-preferences-form.messages";
import { SettingsSectionHeader } from "./settings-page-chrome";

export type NotificationPreferencesFormValues = {
  emailEnabled: boolean;
  emailFormat: UserNotificationEmailFormat;
};

export type NotificationPreferencesFormProps = {
  values: NotificationPreferencesFormValues;
  isSaving?: boolean;
  disabled?: boolean;
  onEmailEnabledChange: (emailEnabled: boolean) => void;
  onEmailFormatChange: (emailFormat: UserNotificationEmailFormat) => void;
};

export function NotificationPreferencesForm({
  values,
  isSaving = false,
  disabled = false,
  onEmailEnabledChange,
  onEmailFormatChange,
}: NotificationPreferencesFormProps) {
  const intl = useIntl();
  const controlsDisabled = disabled || isSaving;

  return (
    <Rows spacing="3u">
      <SettingsSectionHeader
        title={intl.formatMessage(messages.sectionTitle)}
        description={intl.formatMessage(messages.sectionDescription)}
      />

      <Box paddingX="2u" paddingY="1.5u" border="standard" borderRadius="large">
        <Columns spacing="2u" align="spaceBetween" alignY="center">
          <Column width="fluid">
            <Rows spacing="0.5u">
              <FieldLabel htmlFor="notification-email-enabled" className="text-sm font-medium">
                <FormattedMessage {...messages.emailEnabledLabel} />
              </FieldLabel>
              <TypographyP className="text-sm leading-tight text-muted-foreground">
                <FormattedMessage {...messages.emailEnabledDescription} />
              </TypographyP>
            </Rows>
          </Column>
          <Column width="content">
            <Switch
              id="notification-email-enabled"
              checked={values.emailEnabled}
              disabled={controlsDisabled}
              onCheckedChange={onEmailEnabledChange}
              aria-label={intl.formatMessage(messages.emailEnabledLabel)}
            />
          </Column>
        </Columns>
      </Box>

      {values.emailEnabled ? (
        <Field>
          <FieldLabel htmlFor="notification-email-format" className="text-sm font-medium">
            <FormattedMessage {...messages.emailFormatLabel} />
          </FieldLabel>
          <FieldDescription>
            <FormattedMessage {...messages.emailFormatDescription} />
          </FieldDescription>
          <Select
            value={values.emailFormat}
            items={[
              { value: "digest", label: intl.formatMessage(messages.formatDigest) },
              { value: "immediate", label: intl.formatMessage(messages.formatImmediate) },
            ]}
            disabled={controlsDisabled}
            onValueChange={(value) => {
              if (value == null) {
                return;
              }
              onEmailFormatChange(value === "immediate" ? "immediate" : "digest");
            }}
          >
            <SelectTrigger id="notification-email-format" className="w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="digest" label={intl.formatMessage(messages.formatDigest)}>
                <FormattedMessage {...messages.formatDigest} />
              </SelectItem>
              <SelectItem value="immediate" label={intl.formatMessage(messages.formatImmediate)}>
                <FormattedMessage {...messages.formatImmediate} />
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      {isSaving ? (
        <TypographyP className="text-sm text-muted-foreground">
          <FormattedMessage {...messages.saving} />
        </TypographyP>
      ) : null}
    </Rows>
  );
}
