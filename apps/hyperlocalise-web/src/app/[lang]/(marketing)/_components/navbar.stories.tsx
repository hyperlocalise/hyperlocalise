import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { NavbarView } from "./navbar";

const meta = {
  title: "Marketing/Navbar",
  component: NavbarView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    auth: {
      loading: false,
      isAuthenticated: false,
    },
  },
  decorators: [
    (Story) => (
      <div className="min-h-40 min-w-[64rem] bg-background">
        <Story />
        <div className="px-6 py-10 text-sm text-muted-foreground">
          Page content placeholder so the sticky navbar sits against a real surface.
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof NavbarView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedOut: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("link", { name: /Hyperlocalise/i })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Product" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Resources" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Join waitlist" })).toBeInTheDocument();
  },
};

export const SignedIn: Story = {
  args: {
    auth: {
      loading: false,
      isAuthenticated: true,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "Join waitlist" })).not.toBeInTheDocument();
  },
};

export const AuthLoading: Story = {
  args: {
    auth: {
      loading: true,
      isAuthenticated: false,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "Join waitlist" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
  },
};

export const ProductMenuOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "Product" }));

    await expect(body.getByText("Platform")).toBeInTheDocument();
    await expect(body.getByText("Use cases")).toBeInTheDocument();
    await expect(body.getByRole("link", { name: "Agents Automation" })).toBeInTheDocument();
    await expect(body.getByRole("link", { name: "Product localisation" })).toBeInTheDocument();
  },
};

export const ResourcesMenuOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "Resources" }));

    await expect(body.getByText("Documentation")).toBeInTheDocument();
    await expect(body.getByRole("link", { name: /Blog/i })).toBeInTheDocument();
    await expect(body.getByRole("link", { name: "Trust Center" })).toBeInTheDocument();
  },
};
