import type { Preview } from "@storybook/nextjs-vite";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import MockDate from "mockdate";
import { initialize, mswLoader } from "msw-storybook-addon";

import { QueryProvider } from "../src/components/query-provider";
import { ThemeProvider } from "../src/components/theme-provider";
import { TooltipProvider } from "../src/components/ui/tooltip";
import "../src/app/globals.css";
import { mswHandlers } from "./msw-handlers";

initialize({ onUnhandledRequest: "bypass" });

const preview: Preview = {
  decorators: [
    (Story) => (
      <div className="dark min-h-screen bg-background font-sans text-foreground antialiased">
        <AuthKitProvider>
          <QueryProvider>
            <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
              <TooltipProvider>
                <Story />
              </TooltipProvider>
            </ThemeProvider>
          </QueryProvider>
        </AuthKitProvider>
      </div>
    ),
  ],
  loaders: [mswLoader],
  parameters: {
    msw: {
      handlers: mswHandlers,
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  async beforeEach() {
    document.documentElement.classList.add("dark");
    MockDate.set("2024-04-01T12:00:00Z");
  },
};

export default preview;
