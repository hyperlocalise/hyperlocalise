import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Geist_Mono, Figtree, Montserrat } from "next/font/google";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./globals.css";

const figtreeHeading = Figtree({ subsets: ["latin"], variable: "--font-heading" });

const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-sans" });

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
        montserrat.variable,
        figtreeHeading.variable,
      )}
    >
      <body>
        <Analytics />
        <AuthKitProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <TooltipProvider>{children}</TooltipProvider>
          </ThemeProvider>
        </AuthKitProvider>
      </body>
    </html>
  );
}
