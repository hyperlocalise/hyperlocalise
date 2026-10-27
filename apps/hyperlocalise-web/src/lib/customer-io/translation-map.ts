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
import { createHash } from "node:crypto";

import { normalizeSourcePath } from "@/lib/file-storage/records";
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";

import type { CustomerIoAction, CustomerIoActionTranslationPayload } from "./client";
import { CUSTOMER_IO_MESSAGE_TYPES, type CustomerIoMessageType } from "./constants";

export type CustomerIoTranslationMap = Record<string, string>;

export function isCustomerIoTranslationMap(value: unknown): value is CustomerIoTranslationMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === "string");
}

export function readCustomerIoTranslationMap(value: unknown): CustomerIoTranslationMap {
  if (!isCustomerIoTranslationMap(value)) {
    return {};
  }
  const map: CustomerIoTranslationMap = {};
  for (const [key, text] of Object.entries(value)) {
    const trimmedKey = key.trim();
    if (trimmedKey) {
      map[trimmedKey] = text;
    }
  }
  return map;
}

export function serializeCustomerIoTranslationMap(map: CustomerIoTranslationMap): string {
  const sorted = Object.fromEntries(
    Object.entries(map).toSorted(([left], [right]) => left.localeCompare(right)),
  );
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

export function parseCustomerIoTranslationMapJson(text: string): CustomerIoTranslationMap {
  const parsed = safeJsonParse(text);
  if (!parsed.ok) {
    return {};
  }
  return readCustomerIoTranslationMap(parsed.value);
}

export function hashCustomerIoTranslationMap(map: CustomerIoTranslationMap): string {
  return createHash("sha256").update(serializeCustomerIoTranslationMap(map)).digest("hex");
}

/**
 * Customer.io action types with localizable message content in v1.
 * `twilio` carries SMS bodies; webhooks, in-app, and WhatsApp actions are out
 * of scope (Crowdin parity subset).
 */
export function isCustomerIoLocalizableActionType(
  type: string,
): type is CustomerIoMessageType | "twilio" {
  const normalized = type.trim().toLowerCase();
  return (
    (CUSTOMER_IO_MESSAGE_TYPES as readonly string[]).includes(normalized) || normalized === "twilio"
  );
}

const EMAIL_ACTION_FIELDS = ["subject", "preheader_text", "body"] as const;
const PUSH_ACTION_FIELDS = ["title", "body"] as const;
const TEXT_ACTION_FIELDS = ["body"] as const;

function actionFieldsForType(type: string): readonly string[] {
  const normalized = type.trim().toLowerCase();
  if (normalized === "email") {
    return EMAIL_ACTION_FIELDS;
  }
  if (normalized === "push") {
    return PUSH_ACTION_FIELDS;
  }
  return TEXT_ACTION_FIELDS;
}

function readActionField(action: CustomerIoAction, field: string): string | undefined {
  switch (field) {
    case "subject":
      return action.subject;
    case "preheader_text":
      return action.preheaderText;
    case "title":
      return action.title;
    case "body":
      return action.body;
    default:
      return undefined;
  }
}

/** Translatable strings for the default-language action content. */
export function extractCustomerIoActionStrings(action: CustomerIoAction): CustomerIoTranslationMap {
  const map: CustomerIoTranslationMap = {};
  for (const field of actionFieldsForType(action.type)) {
    const value = readActionField(action, field);
    if (typeof value === "string") {
      map[field] = value;
    }
  }
  return map;
}

export function customerIoTranslationMapFromRemote(input: {
  type: string;
  subject?: string;
  preheaderText?: string;
  title?: string;
  body?: string;
}): CustomerIoTranslationMap {
  const map: CustomerIoTranslationMap = {};
  for (const field of actionFieldsForType(input.type)) {
    const value =
      field === "subject"
        ? input.subject
        : field === "preheader_text"
          ? input.preheaderText
          : field === "title"
            ? input.title
            : input.body;
    if (typeof value === "string") {
      map[field] = value;
    }
  }
  return map;
}

export function mergeCustomerIoTranslationMap(input: {
  source: CustomerIoTranslationMap;
  remote: CustomerIoTranslationMap;
  approved: Record<string, string>;
}): CustomerIoTranslationMap {
  return readCustomerIoTranslationMap({
    ...input.source,
    ...input.remote,
    ...input.approved,
  });
}

/**
 * PUT `.../language/{language}` payload for the merged map. Only translatable
 * content fields travel; sender identity and delivery settings stay untouched.
 */
export function buildCustomerIoActionTranslationPayload(
  actionType: string,
  map: CustomerIoTranslationMap,
): CustomerIoActionTranslationPayload {
  const normalized = actionType.trim().toLowerCase();
  const type = normalized === "twilio" ? "twilio" : normalized;
  const payload: CustomerIoActionTranslationPayload = { type };
  for (const field of actionFieldsForType(actionType)) {
    const value = map[field];
    if (typeof value !== "string") {
      continue;
    }
    if (field === "subject") {
      payload.subject = value;
    } else if (field === "preheader_text") {
      payload.preheader_text = value;
    } else if (field === "title") {
      payload.title = value;
    } else {
      payload.body = value;
    }
  }
  return payload;
}

export function buildCustomerIoBroadcastSourcePath(input: {
  broadcastId: string;
  actionId: string;
}): string {
  return normalizeSourcePath(
    `customer-io/broadcasts/${input.broadcastId.trim() || "broadcast"}/actions/${input.actionId.trim() || "action"}.json`,
  );
}

export function buildCustomerIoCampaignSourcePath(input: {
  campaignId: string;
  actionId: string;
}): string {
  return normalizeSourcePath(
    `customer-io/campaigns/${input.campaignId.trim() || "campaign"}/actions/${input.actionId.trim() || "action"}.json`,
  );
}

export function isCustomerIoSourcePath(sourcePath: string): boolean {
  return normalizeSourcePath(sourcePath).startsWith("customer-io/");
}
