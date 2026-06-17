import type { Preview } from "@storybook/nextjs-vite";
import { Domine, Geist_Mono, Open_Sans } from "next/font/google";
import { initialize, mswLoader } from "msw-storybook-addon";

import "../src/app/globals.css";
import { I18nProvider } from "../src/components/i18n/i18n-provider";
import { QueryProvider } from "../src/components/query-provider";
import { ThemeProvider } from "../src/components/theme-provider";
import { Toaster } from "../src/components/ui/sonner";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { cn } from "../src/lib/primitives/cn";
import { mswHandlers } from "./msw-handlers";

initialize({ onUnhandledRequest: "bypass" });

const opensans = Open_Sans({ subsets: ["latin"], variable: "--font-sans" });

const domine = Domine({ subsets: ["latin"], variable: "--font-heading" });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const preview: Preview = {
  decorators: [
    (Story) => (
      <QueryProvider>
        <I18nProvider locale="en">
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            <TooltipProvider>
              <div
                className={cn(
                  "font-sans antialiased",
                  geistMono.variable,
                  domine.variable,
                  opensans.variable,
                )}
              >
                <Story />
              </div>
              <Toaster richColors closeButton />
            </TooltipProvider>
          </ThemeProvider>
        </I18nProvider>
      </QueryProvider>
    ),
  ],
  loaders: [mswLoader],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    msw: {
      handlers: mswHandlers,
    },
  },
  async beforeEach() {
    document.documentElement.classList.add(
      "font-sans",
      "antialiased",
      geistMono.variable,
      domine.variable,
      opensans.variable,
    );
    localStorage.setItem("theme", "dark");
  },
};

export default preview;
