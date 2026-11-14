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
import { Rows } from "@/components/ui/layout/rows";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";

import { AccountProfileForm } from "./account-profile-form";
import { NotificationPreferencesSection } from "./notification-preferences-section";
import { PreferencesForm } from "./preferences-form";
import { SettingsPageBody, SettingsPageHeader } from "./settings-page-chrome";
import { WorkspaceSettingsForm } from "./workspace-settings-form";

type GeneralSettingsPageProps = {
  canUpdateWorkspace: boolean;
  organizationName: string;
  organizationSlug: string;
};

type AccountPageProps = {
  organizationSlug: string;
  userEmail: string;
  firstName: string;
  lastName: string;
};

export async function GeneralSettingsPageContent({
  canUpdateWorkspace,
  organizationName,
  organizationSlug,
}: GeneralSettingsPageProps) {
  const intl = getIntlShape(await getAppLocale());

  return (
    <SettingsPageBody width="form">
      <Rows spacing="4u">
        <SettingsPageHeader
          title={intl.formatMessage({
            defaultMessage: "General",
            id: "MtaQi7PiPN",
            description: "Workspace general settings page heading",
          })}
        />
        <WorkspaceSettingsForm
          canUpdateWorkspace={canUpdateWorkspace}
          organizationName={organizationName}
          organizationSlug={organizationSlug}
        />
      </Rows>
    </SettingsPageBody>
  );
}

export async function AccountSettingsPageContent({
  organizationSlug,
  userEmail,
  firstName,
  lastName,
}: AccountPageProps) {
  const intl = getIntlShape(await getAppLocale());

  return (
    <SettingsPageBody width="form">
      <Rows spacing="8u">
        <SettingsPageHeader
          title={intl.formatMessage({
            defaultMessage: "Account",
            id: "LRlVY40lAz",
            description: "Account settings page heading",
          })}
        />
        <AccountProfileForm email={userEmail} firstName={firstName} lastName={lastName} />
        <NotificationPreferencesSection organizationSlug={organizationSlug} />
      </Rows>
    </SettingsPageBody>
  );
}

export async function PreferencesSettingsPageContent() {
  const intl = getIntlShape(await getAppLocale());

  return (
    <SettingsPageBody width="wide">
      <Rows spacing="4u">
        <SettingsPageHeader
          title={intl.formatMessage({
            defaultMessage: "Preferences",
            id: "7Mts/cDWel",
            description: "Preferences settings page heading",
          })}
        />
        <PreferencesForm />
      </Rows>
    </SettingsPageBody>
  );
}
