import type { ReactNode } from "react";
import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  LinkSquare02Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { withAuth } from "@workos-inc/authkit-nextjs";

import { AppShellClient } from "@/components/app/app-shell-client";
import { AppShellNavigation } from "@/components/app/app-shell-navigation";

const navigation = [
  { label: "Weekly ops", href: "/dashboard", icon: SparklesIcon },
  { label: "Translation run", href: "/dashboard#run", icon: ArrowRight01Icon },
  { label: "Model choice", href: "/dashboard#models", icon: CheckmarkCircle02Icon },
  { label: "TMS sync", href: "/dashboard#sync", icon: LinkSquare02Icon },
  { label: "Analytics", href: "/dashboard#analytics", icon: InformationCircleIcon },
] as const;

export type AppShellProps = {
  children: ReactNode;
};

export async function AppShell({ children }: AppShellProps) {
  const { user } = await withAuth({ ensureSignedIn: true });

  if (!user) {
    return null;
  }

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  return (
    <AppShellClient
      user={{
        email: user.email,
        name: displayName,
        avatarUrl: user.profilePictureUrl ?? undefined,
      }}
      navigation={<AppShellNavigation items={navigation} />}
    >
      {children}
    </AppShellClient>
  );
}
