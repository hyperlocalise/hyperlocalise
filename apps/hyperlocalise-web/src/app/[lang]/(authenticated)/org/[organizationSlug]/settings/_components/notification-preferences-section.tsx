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
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Rows } from "@/components/ui/layout/rows";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import type { UserNotificationEmailFormat } from "@/lib/database/schema/issue-sheet";
import { DEFAULT_USER_NOTIFICATION_PREFERENCES } from "@/lib/notifications/user-notification-preferences";

import {
  NotificationPreferencesForm,
  type NotificationPreferencesFormValues,
} from "./notification-preferences-form";
import { notificationPreferencesFormMessages as messages } from "./notification-preferences-form.messages";

function normalizePreferences(value: unknown): NotificationPreferencesFormValues {
  if (value && typeof value === "object" && "emailEnabled" in value && "emailFormat" in value) {
    const record = value as { emailEnabled: unknown; emailFormat: unknown };
    return {
      emailEnabled: Boolean(record.emailEnabled),
      emailFormat: record.emailFormat === "immediate" ? "immediate" : "digest",
    };
  }
  return { ...DEFAULT_USER_NOTIFICATION_PREFERENCES };
}

async function fetchPreferences(
  organizationSlug: string,
): Promise<NotificationPreferencesFormValues> {
  const response = await apiClient.api.orgs[":organizationSlug"]["notification-preferences"].$get({
    param: { organizationSlug },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error("Failed to load notification preferences");
  }
  if (body && typeof body === "object" && "preferences" in body) {
    return normalizePreferences(body.preferences);
  }
  return { ...DEFAULT_USER_NOTIFICATION_PREFERENCES };
}

export function NotificationPreferencesSection({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const queryKey = ["notification-preferences", organizationSlug] as const;
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => fetchPreferences(organizationSlug),
  });
  const [values, setValues] = useState<NotificationPreferencesFormValues>(
    DEFAULT_USER_NOTIFICATION_PREFERENCES,
  );

  useEffect(() => {
    if (data) {
      setValues(data);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (
      next: NotificationPreferencesFormValues,
    ): Promise<NotificationPreferencesFormValues> => {
      const response = await apiClient.api.orgs[":organizationSlug"][
        "notification-preferences"
      ].$put({
        param: { organizationSlug },
        json: next,
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error("Failed to save notification preferences");
      }
      if (body && typeof body === "object" && "preferences" in body) {
        return normalizePreferences(body.preferences);
      }
      return next;
    },
    onMutate: (next) => {
      const previous =
        queryClient.getQueryData<NotificationPreferencesFormValues>(queryKey) ??
        data ??
        DEFAULT_USER_NOTIFICATION_PREFERENCES;
      setValues(next);
      return { previous };
    },
    onSuccess: (saved) => {
      setValues(saved);
      void queryClient.setQueryData(queryKey, saved);
    },
    onError: (_error, _next, context) => {
      const previous = context?.previous ?? data ?? DEFAULT_USER_NOTIFICATION_PREFERENCES;
      setValues(previous);
      void queryClient.setQueryData(queryKey, previous);
      toast.error(intl.formatMessage(messages.saveError));
    },
  });

  function persist(next: NotificationPreferencesFormValues) {
    saveMutation.mutate(next);
  }

  if (isLoading) {
    return (
      <Rows spacing="3u">
        <TypographyP className="text-sm text-muted-foreground">
          <FormattedMessage {...messages.saving} />
        </TypographyP>
      </Rows>
    );
  }

  if (isError) {
    return (
      <Rows spacing="3u">
        <TypographyP className="text-sm text-destructive">
          <FormattedMessage {...messages.loadError} />
        </TypographyP>
      </Rows>
    );
  }

  return (
    <NotificationPreferencesForm
      values={values}
      isSaving={saveMutation.isPending}
      onEmailEnabledChange={(emailEnabled) => persist({ ...values, emailEnabled })}
      onEmailFormatChange={(emailFormat: UserNotificationEmailFormat) =>
        persist({ ...values, emailFormat })
      }
    />
  );
}
