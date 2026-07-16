import type { ReactNode } from "react";

import "./crowdin-app.css";

export const metadata = {
  title: "Hyperlocalise",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CrowdinAppLayout({ children }: { children: ReactNode }) {
  return (
    <div data-crowdin-app className="crowdin-app-root min-h-svh bg-background text-foreground">
      {children}
    </div>
  );
}
