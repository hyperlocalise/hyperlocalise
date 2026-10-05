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
import type { ReactNode } from "react";
import { FormattedMessage } from "react-intl";

import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import type { WorkspaceAutomationTemplate } from "@/lib/agents/workspace-automation-templates";
import { cn } from "@/lib/primitives/cn";

import { AutomationTemplateFlow, AutomationTemplateTriggerIcon } from "./automation-template-flow";
import { automationsPageViewMessages } from "./automations-page-view.messages";

export type AutomationsLinkRenderer = (props: {
  href: string;
  children: ReactNode;
  className?: string;
}) => ReactNode;

export function defaultRenderAutomationLink({
  href,
  children,
  className,
}: Parameters<AutomationsLinkRenderer>[0]) {
  return (
    <OrgNavLink href={href} className={className}>
      {children}
    </OrgNavLink>
  );
}

export function AutomationTemplateCard({
  automationsBasePath,
  renderAutomationLink,
  template,
}: {
  automationsBasePath: string;
  renderAutomationLink: AutomationsLinkRenderer;
  template: WorkspaceAutomationTemplate;
}) {
  const card = (
    <Card
      size="sm"
      className={cn(
        "flex-row items-start gap-3.5 bg-muted px-5 py-5",
        template.activatable && "transition-colors hover:bg-subtle",
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-subtle ring-1 ring-border">
        <AutomationTemplateTriggerIcon template={template} />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-start gap-2">
          <CardTitle className="text-sm font-semibold">{template.name}</CardTitle>
          {template.activatable ? null : (
            <Badge variant="outline" className="shrink-0">
              <FormattedMessage {...automationsPageViewMessages.comingSoon} />
            </Badge>
          )}
        </div>
        <CardDescription className="line-clamp-2 text-pretty">
          {template.description}
        </CardDescription>
        <AutomationTemplateFlow template={template} />
      </div>
    </Card>
  );

  if (!template.activatable) {
    return card;
  }

  return renderAutomationLink({
    href: `${automationsBasePath}/new?template=${template.id}`,
    className: "rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring",
    children: card,
  });
}
