import type { Preview } from "@storybook/nextjs-vite";
import { Geist_Mono, Inter } from "next/font/google";
import { initialize, mswLoader } from "msw-storybook-addon";
import "@pierre/trees/web-components";

import "../src/app/globals.css";
import { QueryProvider } from "../src/components/query-provider";
import { ThemeProvider } from "../src/components/theme-provider";
import { BrandThemeProvider } from "../src/components/ui/brand-theme";
import { Toaster } from "../src/components/ui/sonner";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { SUPPORTED_APP_LOCALES } from "../src/lib/app-i18n/locales";
import { cn } from "../src/lib/primitives/cn";
import { mswHandlers } from "./msw-handlers";
import { StorybookDecorator, type StorybookTheme } from "./storybook-decorator";

initialize({ onUnhandledRequest: "bypass" });

const inter = Inter({
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-sans",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const preview: Preview = {
  globalTypes: {
    locale: {
      description: "App locale for translated stories",
      toolbar: {
        title: "Locale",
        icon: "globe",
        items: SUPPORTED_APP_LOCALES.map((locale) => ({
          value: locale,
          title: locale.toUpperCase(),
        })),
        dynamicTitle: true,
      },
    },
    theme: {
      description: "Color theme for components",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "light", icon: "sun", title: "Light" },
          { value: "dark", icon: "moon", title: "Dark" },
          { value: "system", icon: "browser", title: "System" },
        ],
        dynamicTitle: true,
      },
    },
    brandTheme: {
      description: "Heading weight for marketing vs product",
      toolbar: {
        title: "Brand",
        icon: "paragraph",
        items: [
          { value: "marketing", title: "Marketing" },
          { value: "product", title: "Product" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    locale: "en",
    theme: "light",
    brandTheme: "product",
  },
  decorators: [
    (Story, { globals }) => (
      <QueryProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <StorybookDecorator
            locale={globals.locale ?? "en"}
            theme={(globals.theme as StorybookTheme | undefined) ?? "light"}
          >
            <TooltipProvider>
              <div className={cn("font-sans antialiased", geistMono.variable, inter.variable)}>
                <BrandThemeProvider
                  theme={globals.brandTheme === "marketing" ? "marketing" : "product"}
                >
                  <Story />
                </BrandThemeProvider>
              </div>
              <Toaster richColors closeButton />
            </TooltipProvider>
          </StorybookDecorator>
        </ThemeProvider>
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
      inter.variable,
    );
  },
};

export default preview;
