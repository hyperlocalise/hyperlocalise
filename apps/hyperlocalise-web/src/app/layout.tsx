import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Domine, Geist_Mono, Open_Sans } from "next/font/google";
import { withAuth } from "@/lib/workos/server-auth";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import { QueryProvider } from "@/components/query-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getAppLocale } from "@/lib/app-i18n/server-locale";
import { GoogleAnalytics } from "@next/third-parties/google";
import { cn } from "@/lib/primitives/cn";
import "./globals.css";

const opensans = Open_Sans({ subsets: ["latin"], variable: "--font-sans" });

const domine = Domine({ subsets: ["latin"], variable: "--font-heading" });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hyperlocalise | Localisation for the Agentic Era",
  description:
    "Localisation for the Agentic Era. Hyperlocalise helps teams review multilingual product copy for quality, nuance, and release safety before it ships.",
};

async function getInitialAuth(): Promise<
  React.ComponentProps<typeof AuthKitProvider>["initialAuth"]
> {
  const { accessToken: _accessToken, ...initialAuth } = await withAuth();
  return initialAuth;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, initialAuth] = await Promise.all([getAppLocale(), getInitialAuth()]);

  return (
    <html
      lang={locale}
      className={cn(
        "antialiased",
        "font-sans",
        geistMono.variable,
        domine.variable,
        opensans.variable,
      )}
      suppressHydrationWarning
    >
      <body>
        <Analytics />
        <AuthKitProvider initialAuth={initialAuth}>
          <I18nProvider locale={locale}>
            <QueryProvider>
              <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
                <TooltipProvider>
                  {children}
                  <Toaster richColors closeButton />
                </TooltipProvider>
              </ThemeProvider>
            </QueryProvider>
          </I18nProvider>
        </AuthKitProvider>
      </body>

      <GoogleAnalytics gaId="G-ET30XL0TE6" />
    </html>
  );
}
