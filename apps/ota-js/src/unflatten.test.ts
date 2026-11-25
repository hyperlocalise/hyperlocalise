import { describe, expect, it } from "vite-plus/test";

import { unflattenMessages } from "./unflatten";

describe("unflattenMessages", () => {
  it("nests dotted keys", () => {
    expect(
      unflattenMessages({
        "checkout.title": "Paiement",
        "checkout.cta.pay": "Payer",
        hello: "Bonjour",
      }),
    ).toEqual({
      checkout: { title: "Paiement", cta: { pay: "Payer" } },
      hello: "Bonjour",
    });
  });

  it("keeps a colliding key flat instead of dropping text", () => {
    expect(
      unflattenMessages({ "a.b": "child", a: "parent", "x.y.z": "deep", "x.y": "mid" }),
    ).toEqual({ a: "parent", "a.b": "child", x: { y: "mid", "y.z": "deep" } });
  });

  it("supports another separator", () => {
    expect(unflattenMessages({ "home:title": "Accueil" }, ":")).toEqual({
      home: { title: "Accueil" },
    });
  });
});
