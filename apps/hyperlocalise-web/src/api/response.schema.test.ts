import { Hono } from "hono";
import { testClient } from "hono/testing";
import { describe, expect, expectTypeOf, it } from "vitest";

import { notFoundResponse } from "./response.schema";

const app = new Hono().get("/things/:thingId", (c) => {
  const thingId = c.req.param("thingId");
  if (thingId === "missing") {
    return notFoundResponse(c, "thing_not_found", "Thing not found");
  }

  return c.json({ thing: { id: thingId } }, 200);
});

describe("response schema helpers", () => {
  it("preserves typed error bodies for status narrowing", async () => {
    const client = testClient(app);
    const response = await client.things[":thingId"].$get({
      param: { thingId: "missing" },
    });

    expect(response.status).toBe(404);

    if (response.status === 404) {
      const body = await response.json();
      expectTypeOf(body.error).toEqualTypeOf<string>();
      expect(body.error).toBe("thing_not_found");
    }
  });
});
