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

import { Label } from "@/components/ui/label";
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
    <div id="notifications" className="space-y-6">
      <div>
        <TypographyP className="text-sm font-medium text-foreground">
          <FormattedMessage {...messages.sectionTitle} />
        </TypographyP>
        <TypographyP className="mt-1 text-sm text-muted-foreground">
          <FormattedMessage {...messages.sectionDescription} />
        </TypographyP>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-lg border border-border px-4 py-3">
        <div className="space-y-1">
          <Label htmlFor="notification-email-enabled" className="text-sm font-medium">
            <FormattedMessage {...messages.emailEnabledLabel} />
          </Label>
          <TypographyP className="text-sm text-muted-foreground">
            <FormattedMessage {...messages.emailEnabledDescription} />
          </TypographyP>
        </div>
        <Switch
          id="notification-email-enabled"
          checked={values.emailEnabled}
          disabled={controlsDisabled}
          onCheckedChange={onEmailEnabledChange}
          aria-label={intl.formatMessage(messages.emailEnabledLabel)}
        />
      </div>

      {values.emailEnabled ? (
        <div className="space-y-2">
          <Label htmlFor="notification-email-format" className="text-sm font-medium">
            <FormattedMessage {...messages.emailFormatLabel} />
          </Label>
          <TypographyP className="text-sm text-muted-foreground">
            <FormattedMessage {...messages.emailFormatDescription} />
          </TypographyP>
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
            <SelectTrigger id="notification-email-format" className="w-full max-w-xs">
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
        </div>
      ) : null}

      {isSaving ? (
        <TypographyP className="text-sm text-muted-foreground">
          <FormattedMessage {...messages.saving} />
        </TypographyP>
      ) : null}
    </div>
  );
}
