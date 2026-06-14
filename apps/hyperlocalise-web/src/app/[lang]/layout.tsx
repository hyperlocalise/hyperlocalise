import { notFound } from "next/navigation";

import { isSupportedAppLocale } from "@/lib/app-i18n/locales";

type LocaleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
};

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { lang } = await params;

  if (!isSupportedAppLocale(lang)) {
    notFound();
  }

  return children;
}
