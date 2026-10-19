import {isRecord, readString} from './json'
import type {SanitySegment} from './plugin-messages'

export const SANITY_SEGMENT_PLUGIN_NAMESPACE = 'hyperlocalise:segment:v1'
export const SANITY_SEGMENT_KEY_PREFIX = 'sanity.k.'

function fillRandomBytes(bytes: Uint8Array<ArrayBuffer>) {
  const webCrypto = globalThis.crypto
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes)
    return
  }
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256)
  }
}

function randomSegmentUlid(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  let id = ''
  const bytes = new Uint8Array(new ArrayBuffer(16))
  fillRandomBytes(bytes)
  for (let i = 0; i < 26; i += 1) {
    const byte = bytes[i % bytes.length] ?? 0
    const index = byte % 32
    id += alphabet[index] ?? '0'
  }
  return id
}

export function mintSanitySegmentKey(): string {
  return `${SANITY_SEGMENT_KEY_PREFIX}${randomSegmentUlid()}`
}

export function parseStampedSegmentKey(raw: string | null | undefined): string | null {
  if (!raw) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    const key = isRecord(parsed) ? readString(parsed.key) : undefined
    if (key?.startsWith(SANITY_SEGMENT_KEY_PREFIX)) {
      return key
    }
  } catch {
    return null
  }
  return null
}

export function serializeStampedSegmentKey(key: string): string {
  return JSON.stringify({key})
}

export function createSanitySegment(input: {
  documentId: string
  documentType: string
  text: string
  existingKey?: string | null
}): SanitySegment {
  return {
    key: input.existingKey ?? mintSanitySegmentKey(),
    documentId: input.documentId,
    documentType: input.documentType,
    text: input.text,
  }
}
