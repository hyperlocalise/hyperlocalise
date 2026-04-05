import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import type { Metadata } from "next";
import { Figtree, Montserrat, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        "font-sans",
        geistMono.variable,
        montserrat.variable,
        figtreeHeading.variable,
      )}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
