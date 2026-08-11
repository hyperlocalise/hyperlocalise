"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type {
  MarketingFooterColumn,
  MarketingFooterLink,
} from "@/components/marketing/marketing-page-content";
import Image from "next/image";
import Link from "next/link";
import { FormattedMessage, useIntl } from "react-intl";

import { marketingFooterMessages } from "./marketing-footer.messages";
import { marketingPageMessages } from "./marketing-page-content.messages";
import type { MarketingPageMessageKey } from "./marketing-page-content.messages";
import { productPageMessages } from "./product/product-page-content.messages";
import type { ProductMessageKey } from "./product/product-page-content.messages";
import { useCasePageMessages } from "./use-case/use-case-page-content.messages";
import type { UseCaseMessageKey } from "./use-case/use-case-page-content.messages";

const FOOTER_IMAGE_SRC = "/images/nasa-yZygONrUBe8-unsplash.jpg";

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

function FooterLinkList({
  links,
  isExternalHref,
}: {
  links: MarketingFooterLink[];
  isExternalHref: (href: string) => boolean;
}) {
  return (
    <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
      {links.map((link) => (
        <li
          key={
            link.useCaseLabelKey ?? link.productLabelKey ?? link.labelKey ?? link.label ?? link.href
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
  );
}

export function MarketingFooter({ columns }: MarketingFooterProps) {
  const intl = useIntl();
  const year = new Date().getFullYear();
  const isExternalHref = (href: string) =>
    href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:");

  return (
    <footer>
      <div className="grid gap-12 lg:grid-cols-[160px_1fr]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="flex size-8 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
            <Image
              src="/images/logo.png"
              width={32}
              height={32}
              alt={intl.formatMessage(marketingFooterMessages.logoAlt)}
            />
          </div>
        </div>

        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
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
              <FooterLinkList links={column.links} isExternalHref={isExternalHref} />
              {column.nested ? (
                <div className="mt-10">
                  <div className="text-sm font-medium text-foreground">{column.nested.title}</div>
                  <FooterLinkList links={column.nested.links} isExternalHref={isExternalHref} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12 flex flex-col gap-2 border-t border-border pt-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p>
          <FormattedMessage {...marketingFooterMessages.copyright} values={{ year }} />
        </p>
        <p>
          <FormattedMessage {...marketingFooterMessages.builtWithLove} />
        </p>
      </div>

      <div className="relative left-1/2 mt-16 w-screen -translate-x-1/2 overflow-hidden">
        <div className="relative h-[22rem] w-full sm:h-[28rem] lg:h-[36rem]">
          <Image
            src={FOOTER_IMAGE_SRC}
            alt={intl.formatMessage(marketingFooterMessages.footerImageAlt)}
            fill
            sizes="100vw"
            className="object-cover object-center"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-background to-transparent sm:h-28"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -left-10 -top-10 size-40 rounded-full bg-background/50 blur-2xl sm:size-56"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-background/50 blur-2xl sm:size-56"
          />
          <p className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-2 text-center font-sans text-7xl font-semibold tracking-tight text-white sm:text-9xl md:text-[10rem] lg:text-[13rem]">
            <FormattedMessage {...marketingFooterMessages.brandWordmark} />
          </p>
        </div>
      </div>
    </footer>
  );
}
