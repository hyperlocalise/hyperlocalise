export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function readResponseJson(response: Response): Promise<unknown> {
  try {
    const value: unknown = await response.json()
    return value
  } catch {
    return null
  }
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function readErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  return readString(value.error)
}
