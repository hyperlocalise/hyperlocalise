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
  type GlossaryImportDocument,
  type GlossaryInterchangeDocument,
  type SerializationResult,
} from "./glossary-interchange";
import { CSV_MIME_TYPE, parseCsv, serializeCsv } from "./csv";
import { parseTbx, serializeTbx } from "./tbx";
import { parseXlsx, serializeXlsx, XLSX_MIME_TYPE } from "./xlsx";

export type GlossaryFormat = "csv" | "tbx" | "xlsx";

export abstract class GlossaryFormatCodec {
  abstract readonly format: GlossaryFormat;
  abstract readonly extension: string;
  abstract readonly mimeType: string;

  abstract parse(input: string | Uint8Array): GlossaryImportDocument;

  abstract serialize(document: GlossaryInterchangeDocument): SerializationResult;
}

class CsvGlossaryFormatCodec extends GlossaryFormatCodec {
  readonly format = "csv" as const;
  readonly extension = "csv";
  readonly mimeType = CSV_MIME_TYPE;

  parse(input: string | Uint8Array) {
    return parseCsv(typeof input === "string" ? input : new TextDecoder().decode(input));
  }

  serialize(document: GlossaryInterchangeDocument) {
    return serializeCsv(document);
  }
}

class TbxGlossaryFormatCodec extends GlossaryFormatCodec {
  readonly format = "tbx" as const;
  readonly extension = "tbx";
  readonly mimeType = "application/xml; charset=utf-8";

  parse(input: string | Uint8Array) {
    return parseTbx(typeof input === "string" ? input : new TextDecoder().decode(input));
  }

  serialize(document: GlossaryInterchangeDocument) {
    return serializeTbx(document);
  }
}

class XlsxGlossaryFormatCodec extends GlossaryFormatCodec {
  readonly format = "xlsx" as const;
  readonly extension = "xlsx";
  readonly mimeType = XLSX_MIME_TYPE;

  parse(input: string | Uint8Array) {
    return parseXlsx(
      typeof input === "string" ? Uint8Array.from(Buffer.from(input, "base64")) : input,
    );
  }

  serialize(document: GlossaryInterchangeDocument) {
    return serializeXlsx(document);
  }
}

const codecs: Record<GlossaryFormat, GlossaryFormatCodec> = {
  csv: new CsvGlossaryFormatCodec(),
  tbx: new TbxGlossaryFormatCodec(),
  xlsx: new XlsxGlossaryFormatCodec(),
};

export class GlossaryFormatFactory {
  static create(format: GlossaryFormat): GlossaryFormatCodec {
    return codecs[format];
  }
}

export function isGlossaryFormat(value: string): value is GlossaryFormat {
  return value === "csv" || value === "tbx" || value === "xlsx";
}
