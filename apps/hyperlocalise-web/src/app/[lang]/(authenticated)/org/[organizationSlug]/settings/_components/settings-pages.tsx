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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Columns } from "@/components/ui/layout/columns";
import { Column } from "@/components/ui/layout/column";
import { Rows } from "@/components/ui/layout/rows";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";

import { NotificationPreferencesSection } from "./notification-preferences-section";
import {
  SettingsPageBody,
  SettingsPageHeader,
  SettingsSectionHeader,
} from "./settings-page-chrome";
import { WorkspaceSettingsForm } from "./workspace-settings-form";

type GeneralSettingsPageProps = {
  canUpdateWorkspace: boolean;
  organizationName: string;
  organizationSlug: string;
};

type AccountPageProps = {
  organizationSlug: string;
  userEmail: string;
  userName: string;
};

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <Field>
      <FieldLabel className="text-xs font-medium text-muted-foreground">{label}</FieldLabel>
      <Input readOnly value={value} className="h-10 bg-muted" />
    </Field>
  );
}

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
          eyebrow={intl.formatMessage({
            defaultMessage: "Workspace",
            id: "w1F8sUHcZ5",
            description: "Eyebrow label above the workspace general settings title",
          })}
          title={intl.formatMessage({
            defaultMessage: "General",
            id: "MtaQi7PiPN",
            description: "Workspace general settings page heading",
          })}
          description={intl.formatMessage({
            defaultMessage:
              "The name and slug used in navigation, invite links, and the workspace URL.",
            id: "bBPogMMlZW",
            description: "Workspace general settings page description",
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
  userName,
}: AccountPageProps) {
  const intl = getIntlShape(await getAppLocale());

  return (
    <SettingsPageBody width="form">
      <Rows spacing="8u">
        <SettingsPageHeader
          eyebrow={intl.formatMessage({
            defaultMessage: "You",
            id: "vU/EulmzwS",
            description: "Eyebrow label above the account settings page title",
          })}
          title={intl.formatMessage({
            defaultMessage: "Account",
            id: "LRlVY40lAz",
            description: "Account settings page heading",
          })}
          description={intl.formatMessage({
            defaultMessage:
              "Profile details from your session, plus how Inbox updates reach email.",
            id: "KzU9psP1Qu",
            description: "Account settings page description",
          })}
        />

        <Rows spacing="3u">
          <SettingsSectionHeader
            title={intl.formatMessage({
              defaultMessage: "Profile",
              id: "dwrrquikgT",
              description: "Section heading for the signed-in user profile on account settings",
            })}
            description={intl.formatMessage({
              defaultMessage: "These details come from your WorkOS session.",
              id: "nYeBrRESbk",
              description: "Helper text under the profile section on account settings",
            })}
          />
          <Columns spacing="2u" collapseBelow="small">
            <Column width="1/2">
              <ReadonlyField
                label={intl.formatMessage({
                  defaultMessage: "Name",
                  id: "AfaXCvPHA0",
                  description: "Label for the readonly user name field on account settings",
                })}
                value={userName}
              />
            </Column>
            <Column width="1/2">
              <ReadonlyField
                label={intl.formatMessage({
                  defaultMessage: "Email",
                  id: "2ynzQ185js",
                  description: "Label for the readonly user email field on account settings",
                })}
                value={userEmail}
              />
            </Column>
          </Columns>
        </Rows>

        <NotificationPreferencesSection organizationSlug={organizationSlug} />
      </Rows>
    </SettingsPageBody>
  );
}
