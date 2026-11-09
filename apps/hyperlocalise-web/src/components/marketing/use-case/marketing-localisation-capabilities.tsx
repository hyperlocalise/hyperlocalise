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

import {
  ChatCircleTextIcon,
  SparkleIcon,
  ShieldCheckIcon,
  UsersIcon,
  ArrowsClockwiseIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react";

import { FormattedMessage } from "react-intl";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import { TypographyH2, TypographyP } from "@/components/ui/typography";

import type { UseCasePageContent } from "./use-case-page-content";

import { useCasePageMessages, type UseCaseMessageKey } from "./use-case-page-content.messages";

type Props = {
  content: UseCasePageContent;
};

function Message({ messageKey }: { messageKey: UseCaseMessageKey }) {
  return <FormattedMessage {...useCasePageMessages[messageKey]} />;
}

const capabilityIcons = [
  ChatCircleTextIcon,
  SparkleIcon,
  ShieldCheckIcon,
  UsersIcon,
  ArrowsClockwiseIcon,
  CheckCircleIcon,
] as const;

export function MarketingLocalisationCapabilities({ content }: Props) {
  const { capabilities } = content;

  return (
    <div className="mx-auto w-full max-w-[1440px]">
      <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20 xl:gap-28">
        {/* Left heading */}
        <div className="max-w-lg">
          <TypographyP className="mb-5 text-sm" tone="subtle">
            <Message messageKey={capabilities.labelKey} />
          </TypographyP>

          <TypographyH2 className="max-w-[520px] text-4xl leading-[1.05] tracking-[-0.05em] sm:text-5xl lg:text-[3.5rem]">
            <Message messageKey={capabilities.titleKey} />
          </TypographyH2>
        </div>

        {/* Right accordion */}
        <div className="min-w-0">
          <Accordion
            defaultValue={["capability-0"]}
            className="w-full !border-0 !rounded-none !shadow-none !bg-transparent last:!border-b-0"
          >
            {capabilities.items.map((item, index) => {
              const Icon = capabilityIcons[index] ?? SparkleIcon;

              return (
                <AccordionItem
                  key={item.titleKey}
                  value={`capability-${index}`}
                  className="border-b border-border !rounded-none !shadow-none !bg-transparent !px-0"
                >
                  <AccordionTrigger className="group flex w-full cursor-pointer items-center gap-4 rounded-xl !pl-0 pr-3 py-4 text-left hover:no-underline [&>svg]:!size-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl">
                      <Icon
                        className="size-4 flex shrink-0 items-center justify-start"
                        weight="regular"
                        aria-hidden
                      />
                    </span>

                    <span className="min-w-0 flex-1 text-sm font-normal leading-5 text-muted-foreground">
                      <Message messageKey={item.titleKey} />
                    </span>
                  </AccordionTrigger>

                  <AccordionContent className="pb-5 pl-[2.5rem] pr-8">
                    <p className="max-w-xl text-sm text-muted-foreground sm:text-[0.95rem] sm:leading-7">
                      <Message messageKey={item.descriptionKey} />
                    </p>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      </div>
    </div>
  );
}
