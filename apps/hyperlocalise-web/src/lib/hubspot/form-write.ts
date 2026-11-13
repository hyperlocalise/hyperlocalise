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
  HUBSPOT_FORM_V3_EMBED_TYPE,
  type HubspotFormDefinition,
  type HubspotVisualFormLayoutNode,
} from "./form-definition";

function dateValue(value: Date | string | number | undefined): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
}

/**
 * HubSpot's form create and replace schemas require `createdAt`.
 * The SDK omits the field when it is missing, and HubSpot then rejects the body.
 * Replace also rejects a body `id` that differs from the form id in the path.
 *
 * Locale copies are always V3. The public Forms API cannot write new-editor (V4)
 * forms, and a V4-shaped create still opens in the legacy editor. Map any visual
 * copy we have onto public fields, then drop the visual-only payload.
 */
export function formDefinitionForWrite(
  definition: HubspotFormDefinition,
  input: { name: string; language: string; id?: string },
): HubspotFormDefinition {
  const next = structuredClone(definition);
  next.name = input.name;
  promoteVisualCopyToPublicFields(next);
  next.configuration = {
    ...next.configuration,
    language: input.language,
    embedType: HUBSPOT_FORM_V3_EMBED_TYPE,
  };
  delete next.layout;
  delete next.elementsDefinition;
  delete next.settings;
  const now = new Date();
  next.createdAt = dateValue(next.createdAt) ?? now;
  next.updatedAt = dateValue(next.updatedAt) ?? now;
  if (typeof next.archived !== "boolean") {
    next.archived = false;
  }
  if (input.id) {
    next.id = input.id;
  } else {
    delete next.id;
    delete next.archivedAt;
  }
  return next;
}

function nonemptyCopy(value: string | undefined): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function collectLayoutNodeIds(
  nodes: HubspotVisualFormLayoutNode[] | undefined,
  into: Set<string>,
): void {
  if (!nodes) {
    return;
  }
  for (const node of nodes) {
    if (node.id !== undefined && String(node.id).trim()) {
      into.add(String(node.id));
    }
    collectLayoutNodeIds(node.nodes, into);
  }
}

function postSubmitElementIds(definition: HubspotFormDefinition): Set<string> {
  const ids = new Set<string>();
  for (const node of definition.layout?.nodes ?? []) {
    if (node.type === "postSubmitStep") {
      collectLayoutNodeIds([node], ids);
    }
  }
  return ids;
}

function promoteVisualCopyToPublicFields(definition: HubspotFormDefinition): void {
  const elements = definition.elementsDefinition;
  if (!elements) {
    return;
  }
  const postSubmitIds = postSubmitElementIds(definition);
  const existingAction = definition.configuration?.postSubmitAction;
  let submitText: string | null = nonemptyCopy(definition.displayOptions?.submitButtonText);
  let thankYou: string | null =
    existingAction?.type === "redirect_url" ? null : nonemptyCopy(existingAction?.value);
  let headingHtml: string | null = nonemptyCopy(definition.fieldGroups?.[0]?.richText);
  for (const [id, element] of Object.entries(elements)) {
    const type = element.type.trim();
    if (!submitText && type === "submitButton") {
      submitText = nonemptyCopy(element.text);
      continue;
    }
    if (!thankYou && type === "richText" && postSubmitIds.has(id)) {
      thankYou = nonemptyCopy(element.html);
      continue;
    }
    if (
      !headingHtml &&
      type === "richText" &&
      !postSubmitIds.has(id) &&
      !element.propertyReference
    ) {
      headingHtml = nonemptyCopy(element.html);
    }
  }
  if (submitText) {
    definition.displayOptions = {
      ...definition.displayOptions,
      submitButtonText: submitText,
    };
  }
  if (thankYou && existingAction?.type !== "redirect_url") {
    definition.configuration = {
      ...definition.configuration,
      postSubmitAction: {
        type: "thank_you",
        value: thankYou,
      },
    };
  }
  if (!headingHtml) {
    return;
  }
  if (!definition.fieldGroups || definition.fieldGroups.length === 0) {
    definition.fieldGroups = [
      {
        groupType: "default_group",
        richTextType: "text",
        richText: headingHtml,
        fields: [],
      },
    ];
    return;
  }
  const group = definition.fieldGroups[0];
  if (!nonemptyCopy(group.richText)) {
    group.richText = headingHtml;
    if (!group.richTextType) {
      group.richTextType = "text";
    }
  }
}
