import { z } from "zod";

export function normalizeProjectId(value: string): string;
export function normalizeProjectId(value: unknown): unknown;
export function normalizeProjectId(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  let projectId = value.trim();
  for (let index = 0; index < 2 && projectId.includes("%"); index += 1) {
    try {
      const decoded = decodeURIComponent(projectId);
      if (decoded === projectId) {
        break;
      }
      projectId = decoded;
    } catch {
      break;
    }
  }

  return projectId;
}

export const projectIdSchema = z.preprocess(normalizeProjectId, z.string().trim().min(1).max(128));

export const optionalProjectIdSchema = z.preprocess(
  normalizeProjectId,
  z.string().trim().min(1).max(128).optional(),
);
