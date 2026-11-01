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
import { EnvelopeIcon, FoldersIcon, GlobeIcon, PlugsConnectedIcon } from "@phosphor-icons/react";
import {
  siContentful,
  siCrowdin,
  siGithub,
  siGitlab,
  siIntercom,
  siSanity,
  siSemrush,
} from "simple-icons";

import { SimpleBrandIcon } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/simple-brand-icon";
import { IntegrationLogo } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/integration-logo";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";

import { AUTOMATION_ICON_GLYPH_TONES } from "./automation-icon-tile";
import type { AutomationListToolId } from "./automations-page-view-model";

const LOGO_ICON_CLASS = "size-3";
const BUILT_IN_ICON_CLASS = AUTOMATION_ICON_GLYPH_TONES.builtIn;

function BrandLogo({ src }: { src: string }) {
  return (
    <span
      data-icon="inline-start"
      className="inline-flex size-3 shrink-0 items-center justify-center"
    >
      <IntegrationLogo src={src} className={LOGO_ICON_CLASS} />
    </span>
  );
}

export function AutomationToolIcon({ toolId }: { toolId: AutomationListToolId }) {
  switch (toolId) {
    case "github":
    case "githubComment":
      return <SimpleBrandIcon icon={siGithub} colored data-icon="inline-start" />;
    case "gitlab":
      return <SimpleBrandIcon icon={siGitlab} colored data-icon="inline-start" />;
    case "slack":
      return <BrandLogo src="/images/slack-logo.svg" />;
    case "contentful":
      return <SimpleBrandIcon icon={siContentful} colored data-icon="inline-start" />;
    case "intercom":
      return <SimpleBrandIcon icon={siIntercom} colored data-icon="inline-start" />;
    case "sanity":
      return <SimpleBrandIcon icon={siSanity} colored data-icon="inline-start" />;
    case "braze":
      return <BrandLogo src="/images/braze-logo.svg" />;
    case "iterable":
      return <BrandLogo src="/images/iterable-logo.png" />;
    case "customerIo":
      return <BrandLogo src="/images/customerio-logo.svg" />;
    case "hubspot":
      return <BrandLogo src="/images/hubspot-logo.svg" />;
    case "crowdin":
      return <SimpleBrandIcon icon={siCrowdin} colored data-icon="inline-start" />;
    case "semrush":
      return <SimpleBrandIcon icon={siSemrush} colored data-icon="inline-start" />;
    case "zernio":
      return <BrandLogo src="/images/zernio-logo.svg" />;
    case "ahrefs":
      return <BrandLogo src="/images/ahrefs-logo.svg" />;
    case "email":
      return <EnvelopeIcon data-icon="inline-start" className={BUILT_IN_ICON_CLASS} />;
    case "mcp":
      return <PlugsConnectedIcon data-icon="inline-start" className={BUILT_IN_ICON_CLASS} />;
    case "knowledgeFiles":
      return <FoldersIcon data-icon="inline-start" className={BUILT_IN_ICON_CLASS} />;
    case "webSearch":
      return <GlobeIcon data-icon="inline-start" className={BUILT_IN_ICON_CLASS} />;
    default:
      return assertNever(toolId);
  }
}
