import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
