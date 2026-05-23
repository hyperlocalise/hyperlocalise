import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type ApiAuthContext, type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import type { Memory } from "@/lib/database/types";
import { toMemoryRecord } from "@/lib/memory/memory-records";

import {
  createMemoryBodySchema,
  listMemoryQuerySchema,
  memoryIdParamsSchema,
  updateMemoryBodySchema,
  type CreateMemoryBody,
  type ListMemoryQuery,
  type UpdateMemoryBody,
} from "./memory.schema";
import {
  forbiddenResponse,
  invalidMemoryPayloadResponse,
  isMemoryMutationAllowed,
  ownedMemoryWhere,
  memoryNotFoundResponse,
} from "./memory.shared";

type MemoryStore = {
  list(auth: ApiAuthContext, query?: ListMemoryQuery): Promise<Memory[]>;
  create(auth: ApiAuthContext, payload: CreateMemoryBody): Promise<Memory>;
  getById(auth: ApiAuthContext, memoryId: string): Promise<Memory | null>;
  update(auth: ApiAuthContext, memoryId: string, payload: UpdateMemoryBody): Promise<Memory | null>;
  delete(auth: ApiAuthContext, memoryId: string): Promise<boolean>;
};

const memoryStore: MemoryStore = {
  async list(auth, query) {
    const limit = query?.limit ?? 50;
    const offset = query?.offset ?? 0;
    return db
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.organizationId, auth.organization.localOrganizationId))
      .orderBy(desc(schema.memories.createdAt))
      .limit(limit)
      .offset(offset);
  },
  async create(auth, payload) {
    const [memory] = await db
      .insert(schema.memories)
      .values({
        organizationId: auth.organization.localOrganizationId,
        createdByUserId: auth.user.localUserId,
        name: payload.name,
        description: payload.description ?? "",
      })
      .returning();

    return memory;
  },
  async getById(auth, memoryId) {
    const [memory] = await db
      .select()
      .from(schema.memories)
      .where(ownedMemoryWhere(auth, memoryId))
      .limit(1);

    return memory ?? null;
  },
  async update(auth, memoryId, payload) {
    const [memory] = await db
      .update(schema.memories)
      .set(payload)
      .where(ownedMemoryWhere(auth, memoryId))
      .returning();

    return memory ?? null;
  },
  async delete(auth, memoryId) {
    const deletedMemories = await db
      .delete(schema.memories)
      .where(ownedMemoryWhere(auth, memoryId))
      .returning({ id: schema.memories.id });

    return deletedMemories.length > 0;
  },
};

const validateMemoryParams = validator("param", (value, c) => {
  const parsed = memoryIdParamsSchema.safeParse(value);

  if (!parsed.success) {
    return memoryNotFoundResponse(c);
  }

  return parsed.data;
});

const validateCreateMemoryBody = validator("json", (value, c) => {
  const parsed = createMemoryBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidMemoryPayloadResponse(c);
  }

  return parsed.data;
});

const validateUpdateMemoryBody = validator("json", (value, c) => {
  const parsed = updateMemoryBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidMemoryPayloadResponse(c);
  }

  return parsed.data;
});

const validateListMemoryQuery = validator("query", (value, _c) => {
  const parsed = listMemoryQuerySchema.safeParse(value);

  if (!parsed.success) {
    return undefined;
  }

  return parsed.data;
});

export function createMemoryRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", validateListMemoryQuery, async (c) => {
      const query = c.req.valid("query");
      const memories = await memoryStore.list(c.var.auth, query);
      return c.json({ memories: memories.map(toMemoryRecord) }, 200);
    })
    .post("/", validateCreateMemoryBody, async (c) => {
      if (!isMemoryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");
      const memory = await memoryStore.create(c.var.auth, payload);
      return c.json({ memory: toMemoryRecord(memory) }, 201);
    })
    .get("/:memoryId", validateMemoryParams, async (c) => {
      const params = c.req.valid("param");
      const memory = await memoryStore.getById(c.var.auth, params.memoryId);

      if (!memory) {
        return memoryNotFoundResponse(c);
      }

      return c.json({ memory: toMemoryRecord(memory) }, 200);
    })
    .patch("/:memoryId", validateMemoryParams, validateUpdateMemoryBody, async (c) => {
      if (!isMemoryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const payload = c.req.valid("json");
      const memory = await memoryStore.getById(c.var.auth, params.memoryId);

      if (!memory) {
        return memoryNotFoundResponse(c);
      }

      if (memory.source === "external_tms") {
        return forbiddenResponse(c);
      }

      const updated = await memoryStore.update(c.var.auth, params.memoryId, payload);

      if (!updated) {
        return memoryNotFoundResponse(c);
      }

      return c.json({ memory: toMemoryRecord(updated) }, 200);
    })
    .delete("/:memoryId", validateMemoryParams, async (c) => {
      if (!isMemoryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const memory = await memoryStore.getById(c.var.auth, params.memoryId);

      if (!memory) {
        return memoryNotFoundResponse(c);
      }

      if (memory.source === "external_tms") {
        return forbiddenResponse(c);
      }

      const deleted = await memoryStore.delete(c.var.auth, params.memoryId);

      if (!deleted) {
        return memoryNotFoundResponse(c);
      }

      return c.body(null, 204);
    });
}
