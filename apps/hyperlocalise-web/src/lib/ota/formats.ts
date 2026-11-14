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
import type { OtaDistributionFormat, OtaPublicFormat } from "@/lib/database/schema/ota";

export const OTA_CACHE_CONTROL = "public, max-age=3600";

export function toOtaPublicFormat(format: OtaDistributionFormat): OtaPublicFormat {
  switch (format) {
    case "android_xml":
      return "android-xml";
    case "ios_strings":
      return "ios-strings";
    default:
      return "json";
  }
}

export function otaContentType(format: OtaDistributionFormat): string {
  switch (format) {
    case "android_xml":
      return "application/xml; charset=utf-8";
    case "ios_strings":
      return "text/plain; charset=utf-8";
    default:
      return "application/json; charset=utf-8";
  }
}

export function otaManifestContentType(): string {
  return "application/json; charset=utf-8";
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function androidResourceName(key: string): string {
  return key.replaceAll(/[./]/g, "_");
}

function escapeIosString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

export function serializeOtaFile(
  format: OtaDistributionFormat,
  entries: ReadonlyArray<{ key: string; text: string }>,
): Buffer {
  switch (format) {
    case "android_xml": {
      const lines = [
        `<?xml version="1.0" encoding="utf-8"?>`,
        `<resources>`,
        ...entries.map(
          (entry) =>
            `    <string name="${escapeXml(androidResourceName(entry.key))}">${escapeXml(entry.text)}</string>`,
        ),
        `</resources>`,
        "",
      ];
      return Buffer.from(lines.join("\n"), "utf8");
    }
    case "ios_strings": {
      if (entries.length === 0) {
        return Buffer.from("", "utf8");
      }
      const body = entries
        .map((entry) => `"${escapeIosString(entry.key)}" = "${escapeIosString(entry.text)}";`)
        .join("\n");
      return Buffer.from(`${body}\n`, "utf8");
    }
    default: {
      const object = Object.fromEntries(entries.map((entry) => [entry.key, entry.text]));
      return Buffer.from(JSON.stringify(object), "utf8");
    }
  }
}
