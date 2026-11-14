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
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { IntlProvider, useIntl } from "react-intl";
import { toast } from "sonner";

import { navigateToAppLocale } from "@/components/locale-toggle/navigate-to-app-locale";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { DEFAULT_APP_LOCALE } from "@/lib/app-i18n/locales";
import { useAppLocale } from "@/lib/app-i18n/use-app-locale";
import type { SessionAccount } from "@/lib/go-svc/go-svc-account-api";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import {
  USER_PREFERENCES_QUERY_KEY,
  buildDefaultUserPreferences,
  formattingLocaleForHourCycle,
  parseUserPreferences,
  type UserPreferences,
} from "@/lib/user-preferences/user-preferences";

import { userPreferencesProviderMessages as messages } from "./user-preferences-provider.messages";

type UserPreferencesContextValue = {
  isLoading: boolean;
  isSaving: boolean;
  preferences: UserPreferences;
  update: (patch: Partial<UserPreferences>) => Promise<void>;
};

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);

export function useOptionalUserPreferences() {
  return useContext(UserPreferencesContext);
}

export function useUserPreferences() {
  const value = useContext(UserPreferencesContext);
  if (!value) {
    throw new Error("useUserPreferences must be used within UserPreferencesProvider.");
  }
  return value;
}

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const intl = useIntl();
  const locale = useAppLocale();
  const { setTheme } = useTheme();
  const { client, loading: clientLoading } = useGoSvcClient();
  const queryClient = useQueryClient();
  const persistedDefaults = useRef(false);
  const redirectedLocale = useRef(false);

  const query = useQuery({
    queryKey: USER_PREFERENCES_QUERY_KEY,
    enabled: !clientLoading,
    queryFn: () => client.account.get(),
  });

  const saveMutation = useMutation({
    mutationFn: (next: UserPreferences) => client.account.updatePreferences(next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: USER_PREFERENCES_QUERY_KEY });
      const previous = queryClient.getQueryData<SessionAccount>(USER_PREFERENCES_QUERY_KEY);
      queryClient.setQueryData<SessionAccount>(USER_PREFERENCES_QUERY_KEY, (current) =>
        current ? { ...current, preferences: next } : current,
      );
      return { previous };
    },
    onSuccess: (account) => {
      queryClient.setQueryData(USER_PREFERENCES_QUERY_KEY, account);
    },
    onError: (_error, _next, context) => {
      if (context?.previous) {
        queryClient.setQueryData(USER_PREFERENCES_QUERY_KEY, context.previous);
      }
      toast.error(intl.formatMessage(messages.saveError));
    },
  });

  const savedPreferences = parseUserPreferences(query.data?.preferences);
  const preferences = savedPreferences ?? buildDefaultUserPreferences(locale);

  useEffect(() => {
    if (!query.data) {
      return;
    }
    if (query.data.preferences == null) {
      if (persistedDefaults.current) {
        return;
      }
      persistedDefaults.current = true;
      saveMutation.mutate(buildDefaultUserPreferences(locale));
      return;
    }
    const saved = parseUserPreferences(query.data.preferences);
    if (!saved) {
      return;
    }
    setTheme(saved.theme);
    if (!redirectedLocale.current && saved.locale !== locale) {
      redirectedLocale.current = true;
      navigateToAppLocale(saved.locale);
    }
    // Persist-once and locale redirect are keyed off the GET payload, not mutation identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, query.data, setTheme]);

  const update = useCallback(
    async (patch: Partial<UserPreferences>) => {
      const next = { ...preferences, ...patch };
      if (patch.theme) {
        setTheme(patch.theme);
      }
      await saveMutation.mutateAsync(next);
      if (patch.locale && patch.locale !== locale) {
        navigateToAppLocale(patch.locale);
      }
    },
    [locale, preferences, saveMutation, setTheme],
  );

  const value = useMemo(
    (): UserPreferencesContextValue => ({
      isLoading: query.isLoading || clientLoading,
      isSaving: saveMutation.isPending,
      preferences,
      update,
    }),
    [clientLoading, preferences, query.isLoading, saveMutation.isPending, update],
  );

  const messagesCatalog = useMemo(() => getIntlShape(locale).messages, [locale]);
  const formattingLocale = formattingLocaleForHourCycle(locale, preferences.hourCycle);

  return (
    <UserPreferencesContext.Provider value={value}>
      <IntlProvider
        locale={formattingLocale}
        defaultLocale={DEFAULT_APP_LOCALE}
        messages={messagesCatalog}
        timeZone={preferences.timezone}
      >
        {children}
      </IntlProvider>
    </UserPreferencesContext.Provider>
  );
}
