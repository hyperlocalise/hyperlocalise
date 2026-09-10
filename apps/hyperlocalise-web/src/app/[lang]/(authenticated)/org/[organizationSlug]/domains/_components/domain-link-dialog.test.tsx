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

// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";
import { getResearchPrototypeDomain } from "@/lib/domains/research-prototype";
import { DomainLinkDialog } from "./domain-link-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

describe("domain locale editing", () => {
    it("requires a locale and links one hostname with multiple locales", () => {
        const onSave = vi.fn();
        render(<IntlProvider locale="en"><DomainLinkDialog open onOpenChange={() => {}} onSave={onSave} /></IntlProvider>);
        fireEvent.change(screen.getByLabelText("Hostname"), { target: { value: "EXAMPLE.COM" } });
        fireEvent.click(screen.getByRole("button", { name: "Continue to verification" }));
        expect(screen.getByText("Select at least one locale.")).toBeInTheDocument();
        expect(onSave).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("checkbox", { name: "French (France)" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "German (Germany)" }));
        fireEvent.click(screen.getByRole("button", { name: "Continue to verification" }));
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ domainKey: "example.com", status: "pending_verification", locales: [expect.objectContaining({ id: "france-fr" }), expect.objectContaining({ id: "germany-de" })] }));
    });

    it("edits locales without changing domain identity or verification", () => {
        const domain = getResearchPrototypeDomain("hyperlocalise-com")!;
        const onSave = vi.fn();
        render(<IntlProvider locale="en"><DomainLinkDialog open domain={domain} onOpenChange={() => {}} onSave={onSave} /></IntlProvider>);
        expect(screen.getByRole("checkbox", { name: "German (Germany)" })).toBeChecked();
        expect(screen.getByLabelText("Hostname")).toHaveAttribute("readonly");
        fireEvent.click(screen.getByRole("checkbox", { name: "French (France)" }));
        fireEvent.click(screen.getByRole("button", { name: "Save locales" }));
        expect(onSave).toHaveBeenCalledWith({ ...domain, locales: domain.locales.slice(1) });
    });

    it("rejects duplicate hostnames instead of adding another domain row", () => {
        const domain = getResearchPrototypeDomain("hyperlocalise-com")!;
        const onSave = vi.fn();
        render(<IntlProvider locale="en"><DomainLinkDialog open existingDomains={[domain]} onOpenChange={() => {}} onSave={onSave} /></IntlProvider>);
        fireEvent.change(screen.getByLabelText("Hostname"), { target: { value: domain.domainKey } });
        fireEvent.click(screen.getByRole("button", { name: "Continue to verification" }));
        expect(screen.getByText("This domain is already linked. Edit its locales instead.")).toBeInTheDocument();
        expect(onSave).not.toHaveBeenCalled();
    });
});
