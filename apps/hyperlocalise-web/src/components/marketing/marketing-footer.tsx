"use client";

import type { MarketingFooterColumn } from "@/components/marketing/marketing-page-content";
import Image from "next/image";
import Link from "next/link";
import { FormattedMessage } from "react-intl";

import { marketingPageMessages } from "./marketing-page-content.messages";
import type { MarketingPageMessageKey } from "./marketing-page-content.messages";
import { productPageMessages } from "./product/product-page-content.messages";
import type { ProductMessageKey } from "./product/product-page-content.messages";
import { useCasePageMessages } from "./use-case/use-case-page-content.messages";
import type { UseCaseMessageKey } from "./use-case/use-case-page-content.messages";

type MarketingFooterProps = {
  columns: MarketingFooterColumn[];
};

function FooterLinkLabel({
  label,
  labelKey,
  useCaseLabelKey,
  productLabelKey,
}: {
  label?: string;
  labelKey?: string;
  useCaseLabelKey?: UseCaseMessageKey;
  productLabelKey?: ProductMessageKey;
}) {
  if (useCaseLabelKey) {
    return <FormattedMessage {...useCasePageMessages[useCaseLabelKey]} />;
  }

  if (productLabelKey) {
    return <FormattedMessage {...productPageMessages[productLabelKey]} />;
  }

  if (labelKey) {
    return <FormattedMessage {...marketingPageMessages[labelKey as MarketingPageMessageKey]} />;
  }

  return label;
}

export function MarketingFooter({ columns }: MarketingFooterProps) {
  const isExternalHref = (href: string) =>
    href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:");

  return (
    <footer className="grid gap-12 lg:grid-cols-[160px_1fr]">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="flex size-8 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
          <Image src="/images/logo.png" width={32} height={32} alt="Hyperlocalise logo" />
        </div>
      </div>

      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        {columns.map((column) => (
          <div key={column.titleKey ?? column.title}>
            <div className="text-sm font-medium text-foreground">
              {column.titleKey ? (
                <FormattedMessage
                  {...marketingPageMessages[column.titleKey as MarketingPageMessageKey]}
                />
              ) : (
                column.title
              )}
            </div>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              {column.links.map((link) => (
                <li
                  key={
                    link.useCaseLabelKey ??
                    link.productLabelKey ??
                    link.labelKey ??
                    link.label ??
                    link.href
                  }
                >
                  {isExternalHref(link.href) ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <FooterLinkLabel
                        label={link.label}
                        labelKey={link.labelKey}
                        useCaseLabelKey={link.useCaseLabelKey}
                        productLabelKey={link.productLabelKey}
                      />
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="inline-flex rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <FooterLinkLabel
                        label={link.label}
                        labelKey={link.labelKey}
                        useCaseLabelKey={link.useCaseLabelKey}
                        productLabelKey={link.productLabelKey}
                      />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}
