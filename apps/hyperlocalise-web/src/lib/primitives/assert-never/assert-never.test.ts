import { describe, expect, it } from "vite-plus/test";

import { assertNever } from "./assert-never";

describe("assertNever", () => {
  it("throws with the unhandled value", () => {
    expect(() => assertNever({ code: "new_case" } as never)).toThrow(
      'Unhandled case: {"code":"new_case"}',
    );
  });
});
