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

export type HubspotFormPropertyReference = {
  objectTypeId?: string;
  name: string;
};

export type HubspotFormFieldOption = {
  value: string;
  label: string;
};

export type HubspotFormDependent = {
  dependentField?: HubspotFormField;
};

export type HubspotFormField = {
  name?: string;
  fieldType?: string;
  label?: string;
  placeholder?: string;
  description?: string;
  defaultValue?: string;
  richText?: string;
  html?: string;
  content?: string;
  text?: string;
  options?: HubspotFormFieldOption[];
  dependentFields?: HubspotFormDependent[];
};

export type HubspotFormFieldGroup = {
  groupType?: string;
  richTextType?: string;
  richText?: string;
  fields?: HubspotFormField[];
};

export type HubspotFormDisplayOptions = {
  submitButtonText?: string;
};

export type HubspotFormPostSubmitAction = {
  type?: string;
  value?: string;
};

export type HubspotFormConfiguration = {
  language?: string;
  postSubmitAction?: HubspotFormPostSubmitAction;
};

export type HubspotVisualFormElement = {
  type: string;
  id: number | string;
  propertyReference?: HubspotFormPropertyReference;
  label?: string;
  placeholder?: string;
  description?: string;
  text?: string;
  html?: string;
};

export type HubspotVisualFormLayoutNode = {
  type?: string;
  id?: number | string;
  nodes?: HubspotVisualFormLayoutNode[];
};

export type HubspotVisualFormLayout = {
  nodes?: HubspotVisualFormLayoutNode[];
};

export type HubspotFormSettings = {
  hubspotFormLocale?: string;
};

export type HubspotFormLegalConsent = {
  type?: string;
  privacyText?: string;
  communicationConsentText?: string;
  consentToProcessText?: string;
  legitimateInterestText?: string;
};

/** Public form definition, plus visual layout and elements when HubSpot sends them. */
export type HubspotFormDefinition = {
  id?: string;
  name?: string;
  displayOptions?: HubspotFormDisplayOptions;
  configuration?: HubspotFormConfiguration;
  fieldGroups?: HubspotFormFieldGroup[];
  legalConsentOptions?: HubspotFormLegalConsent;
  layout?: HubspotVisualFormLayout;
  elementsDefinition?: Record<string, HubspotVisualFormElement>;
  settings?: HubspotFormSettings;
  createdAt?: Date | string | number;
  updatedAt?: Date | string | number;
  archived?: boolean;
  archivedAt?: Date | string | number;
};

export function asFormDefinition(value: object): HubspotFormDefinition {
  return value as HubspotFormDefinition;
}

export function formLanguage(definition: HubspotFormDefinition): string | null {
  const language = definition.configuration?.language?.trim();
  if (language) {
    return language;
  }
  const locale = definition.settings?.hubspotFormLocale?.trim();
  return locale || null;
}
