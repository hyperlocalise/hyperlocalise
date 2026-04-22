import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Domine, Geist_Mono, Open_Sans } from "next/font/google";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { QueryProvider } from "@/components/query-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "antialiased",
        "font-sans",
        geistMono.variable,
        domine.variable,
        opensans.variable,
      )}
    >
      <body>
        <Analytics />
        <AuthKitProvider>
          <QueryProvider>
            <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
              <TooltipProvider>{children}</TooltipProvider>
            </ThemeProvider>
          </QueryProvider>
        </AuthKitProvider>
      </body>
    </html>
  );
}
