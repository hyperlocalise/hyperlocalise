import { render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { App } from "./app";

describe("Figma plugin UI", () => {
    it("renders OAuth sign-in before a session exists", () => {
        const result = render(<App />);

        expect(result.getByRole("button", { name: "Sign in with Hyperlocalise" })).toBeTruthy();
        expect(result.getByText("Hyperlocalise URL")).toBeTruthy();
        expect(result.queryByRole("button", { name: "Create job and generate" })).toBeNull();
    });
});
