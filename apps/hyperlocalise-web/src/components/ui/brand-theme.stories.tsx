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
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { BrandThemeProvider } from "./brand-theme";
import { TypographyH1, TypographyH2, TypographyP } from "./typography";

const meta = {
  title: "UI/Brand Theme",
  component: BrandThemeProvider,
  args: {
    theme: "marketing",
  },
} satisfies Meta<typeof BrandThemeProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

function ThemeSpecimen({
  theme,
  title,
  subtitle,
}: {
  theme: "marketing" | "product";
  title: string;
  subtitle: string;
}) {
  return (
    <BrandThemeProvider theme={theme} className="rounded-lg border border-border p-6">
      <p className="mb-3 font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {theme}
      </p>
      <TypographyH1 className="text-3xl md:text-4xl">{title}</TypographyH1>
      <TypographyH2 className="mt-3 text-xl md:text-2xl">{subtitle}</TypographyH2>
      <TypographyP className="mt-3 text-muted-foreground">
        Headings use <code className="font-mono text-sm">font-heading</code>, which follows the
        brand theme.
      </TypographyP>
    </BrandThemeProvider>
  );
}

export const Overview: Story = {
  render: () => (
    <div className="grid max-w-5xl gap-4 p-6 md:grid-cols-2">
      <ThemeSpecimen
        theme="marketing"
        title="Launch in every market"
        subtitle="Serif display headings"
      />
      <ThemeSpecimen theme="product" title="Review queue" subtitle="Sans product headings" />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("marketing")).toBeInTheDocument();
    const marketing = canvas.getByText("Launch in every market").closest("[data-brand-theme]");
    const product = canvas.getByText("Review queue").closest("[data-brand-theme]");
    await expect(marketing).toHaveAttribute("data-brand-theme", "marketing");
    await expect(product).toHaveAttribute("data-brand-theme", "product");
  },
};
