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
import JSZip from "jszip";

import { err, isErr, ok, fromThrowableAsync, type Result } from "@/lib/primitives/result/results";

import {
  applyLottieTextTranslations,
  isLottieTextKey,
  parseLottieJson,
  type LottiePayload,
} from "./lottie-document";

const DOTLOTTIE_KEY_SEPARATOR = "#";
/** dotLottie v1 stores animations in `animations/`, v2 in `a/`. */
const DOTLOTTIE_ANIMATION_DIRS = ["animations/", "a/"] as const;
/** dotLottie v1 stores images in `images/`, v2 in `i/`. */
const DOTLOTTIE_IMAGE_DIRS = ["images/", "i/"] as const;
/** Same cap as the CLI parser, to bound decompressed animation size. */
const DOTLOTTIE_MAX_ENTRY_BYTES = 64 * 1024 * 1024;

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

export type DotLottieArchiveError =
  | { code: "invalid_archive" }
  | { code: "entry_too_large"; entryName: string }
  | { code: "no_animations" };

export type DotLottieAnimation = {
  entryName: string;
  payload: LottiePayload;
};

export function isDotLottieAnimationEntry(name: string): boolean {
  if (name.endsWith("/") || !name.toLowerCase().endsWith(".json")) {
    return false;
  }
  return DOTLOTTIE_ANIMATION_DIRS.some((dir) => name.startsWith(dir));
}

/** Splits on the final `#` so entry names may themselves contain `#`. */
export function splitDotLottieCompositeKey(
  key: string,
): { entryName: string; lottieKey: string } | null {
  const index = key.lastIndexOf(DOTLOTTIE_KEY_SEPARATOR);
  if (index <= 0 || index >= key.length - DOTLOTTIE_KEY_SEPARATOR.length) {
    return null;
  }
  return {
    entryName: key.slice(0, index),
    lottieKey: key.slice(index + DOTLOTTIE_KEY_SEPARATOR.length),
  };
}

export function isDotLottieTextKey(key: string): boolean {
  const parts = splitDotLottieCompositeKey(key);
  return Boolean(
    parts && isDotLottieAnimationEntry(parts.entryName) && isLottieTextKey(parts.lottieKey),
  );
}

function groupValuesByEntry(
  values: Readonly<Record<string, string>>,
): Map<string, Record<string, string>> {
  const grouped = new Map<string, Record<string, string>>();
  for (const [key, value] of Object.entries(values)) {
    const parts = splitDotLottieCompositeKey(key);
    if (!parts) {
      continue;
    }
    const entryValues = grouped.get(parts.entryName) ?? {};
    entryValues[parts.lottieKey] = value;
    grouped.set(parts.entryName, entryValues);
  }
  return grouped;
}

async function loadArchive(
  archive: ArrayBuffer | Uint8Array,
): Promise<Result<JSZip, DotLottieArchiveError>> {
  const loaded = await fromThrowableAsync(JSZip.loadAsync(archive));
  return isErr(loaded) ? err({ code: "invalid_archive" }) : ok(loaded.value);
}

function zipEntryUncompressedSize(file: JSZip.JSZipObject): number | null {
  const data = (file as { _data?: { uncompressedSize?: number } })._data;
  if (data && typeof data.uncompressedSize === "number" && data.uncompressedSize >= 0) {
    return data.uncompressedSize;
  }
  return null;
}

class DotLottieEntryTooLargeError extends Error {
  constructor(readonly entryName: string) {
    super("entry_too_large");
  }
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

type ZipStreamLike = {
  on(event: "data", listener: (chunk: Uint8Array) => void): ZipStreamLike;
  on(event: "end" | "error", listener: (error?: unknown) => void): ZipStreamLike;
  removeListener(event: "data", listener: (chunk: Uint8Array) => void): void;
  destroy?: () => void;
  resume?: () => void;
};

function readZipEntryFromStream(
  stream: ZipStreamLike,
  entryName: string,
  maxBytes: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let total = 0;

    const onData = (chunk: Uint8Array) => {
      total += chunk.length;
      if (total > maxBytes) {
        stream.removeListener("data", onData);
        stream.destroy?.();
        reject(new DotLottieEntryTooLargeError(entryName));
        return;
      }
      chunks.push(chunk);
    };

    stream.on("data", onData);
    stream.on("end", () => resolve(concatUint8Arrays(chunks)));
    stream.on("error", reject);
    stream.resume?.();
  });
}

async function readZipEntryBytes(file: JSZip.JSZipObject, maxBytes: number): Promise<Uint8Array> {
  if (typeof file.nodeStream === "function") {
    try {
      return await readZipEntryFromStream(
        file.nodeStream("nodebuffer") as ZipStreamLike,
        file.name,
        maxBytes,
      );
    } catch (error) {
      if (error instanceof DotLottieEntryTooLargeError) {
        throw error;
      }
    }
  }

  const zipObject = file as JSZip.JSZipObject & {
    internalStream?: (type: "uint8array") => ZipStreamLike;
  };
  if (typeof zipObject.internalStream === "function") {
    return readZipEntryFromStream(zipObject.internalStream("uint8array"), file.name, maxBytes);
  }

  const bytes = await file.async("uint8array");
  if (bytes.length > maxBytes) {
    throw new DotLottieEntryTooLargeError(file.name);
  }
  return bytes;
}

async function readZipEntryWithLimit(
  file: JSZip.JSZipObject,
  maxBytes: number,
): Promise<Result<Uint8Array, DotLottieArchiveError>> {
  const metadataSize = zipEntryUncompressedSize(file);
  if (metadataSize !== null && metadataSize > maxBytes) {
    return err({ code: "entry_too_large", entryName: file.name });
  }

  const read = await fromThrowableAsync(readZipEntryBytes(file, maxBytes));
  if (isErr(read)) {
    if (read.error instanceof DotLottieEntryTooLargeError) {
      return err({ code: "entry_too_large", entryName: read.error.entryName });
    }
    return err({ code: "invalid_archive" });
  }

  return ok(read.value);
}

async function readAnimationEntry(
  file: JSZip.JSZipObject,
): Promise<Result<LottiePayload | null, DotLottieArchiveError>> {
  const read = await readZipEntryWithLimit(file, DOTLOTTIE_MAX_ENTRY_BYTES);
  if (isErr(read)) {
    return read;
  }
  return ok(parseLottieJson(new TextDecoder().decode(read.value)));
}

function animationEntries(zip: JSZip): JSZip.JSZipObject[] {
  return Object.values(zip.files)
    .filter((file) => !file.dir && isDotLottieAnimationEntry(file.name))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

export async function readDotLottieAnimations(
  archive: ArrayBuffer | Uint8Array,
): Promise<Result<DotLottieAnimation[], DotLottieArchiveError>> {
  const zip = await loadArchive(archive);
  if (isErr(zip)) {
    return zip;
  }

  const animations: DotLottieAnimation[] = [];
  for (const file of animationEntries(zip.value)) {
    const payload = await readAnimationEntry(file);
    if (isErr(payload)) {
      return payload;
    }
    if (payload.value) {
      animations.push({ entryName: file.name, payload: payload.value });
    }
  }

  if (animations.length === 0) {
    return err({ code: "no_animations" });
  }
  return ok(animations);
}

/**
 * Rebuilds the archive with translated text. Only animations with translated keys are
 * rewritten; the manifest, images, themes, and state machines are carried over as-is.
 */
export async function applyDotLottieTextTranslations(
  archive: ArrayBuffer | Uint8Array,
  values: Readonly<Record<string, string>>,
): Promise<Result<Uint8Array, DotLottieArchiveError>> {
  const zip = await loadArchive(archive);
  if (isErr(zip)) {
    return zip;
  }

  const valuesByEntry = groupValuesByEntry(values);
  let animationCount = 0;
  for (const file of animationEntries(zip.value)) {
    const payload = await readAnimationEntry(file);
    if (isErr(payload)) {
      return payload;
    }
    if (!payload.value) {
      continue;
    }
    animationCount += 1;
    const entryValues = valuesByEntry.get(file.name);
    if (!entryValues) {
      continue;
    }
    zip.value.file(
      file.name,
      JSON.stringify(applyLottieTextTranslations(payload.value, entryValues)),
    );
  }

  if (animationCount === 0) {
    return err({ code: "no_animations" });
  }

  const generated = await fromThrowableAsync(
    zip.value.generateAsync({ type: "uint8array", compression: "DEFLATE" }),
  );
  return isErr(generated) ? err({ code: "invalid_archive" }) : ok(generated.value);
}

function imageMimeType(filename: string): string {
  const extension = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  return IMAGE_MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

/**
 * Embeds archive images into the animation as data URLs so a player can render it
 * without resolving paths inside the zip.
 */
export async function inlineDotLottieImages(
  archive: ArrayBuffer | Uint8Array,
  payload: LottiePayload,
): Promise<Result<LottiePayload, DotLottieArchiveError>> {
  const assets = Array.isArray(payload.assets) ? payload.assets : [];
  if (assets.length === 0) {
    return ok(payload);
  }

  const zip = await loadArchive(archive);
  if (isErr(zip)) {
    return zip;
  }

  const copy = structuredClone(payload);
  for (const rawAsset of copy.assets as unknown[]) {
    const asset = rawAsset as Record<string, unknown>;
    if (Array.isArray(asset.layers) || typeof asset.p !== "string" || asset.e === 1) {
      continue;
    }
    const filename = asset.p;
    const file = DOTLOTTIE_IMAGE_DIRS.map((dir) => zip.value.file(`${dir}${filename}`)).find(
      (entry) => entry !== null,
    );
    if (!file) {
      continue;
    }
    const imageBytes = await readZipEntryWithLimit(file, DOTLOTTIE_MAX_ENTRY_BYTES);
    if (isErr(imageBytes)) {
      return imageBytes;
    }
    const base64 = bytesToBase64(imageBytes.value);
    asset.u = "";
    asset.p = `data:${imageMimeType(filename)};base64,${base64}`;
    asset.e = 1;
  }
  return ok(copy);
}
