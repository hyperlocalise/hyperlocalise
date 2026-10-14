import { describe, expect, it } from "vite-plus/test";

import { fontNameCacheKey } from "./load-text-node-fonts";

describe("fontNameCacheKey", () => {
  it("dedupes fonts with the same family, style, and variation settings", () => {
    const font = { family: "Epilogue", style: "Regular" };
    expect(fontNameCacheKey(font)).toBe(fontNameCacheKey({ ...font }));
  });

  it("treats different variation settings as distinct fonts", () => {
    const a = { family: "Inter", style: "Regular", variationSettings: { wght: 400 } };
    const b = { family: "Inter", style: "Regular", variationSettings: { wght: 700 } };
    expect(fontNameCacheKey(a)).not.toBe(fontNameCacheKey(b));
  });
});
