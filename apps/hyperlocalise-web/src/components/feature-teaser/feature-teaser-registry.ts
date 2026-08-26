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
import { defineMessages, type MessageDescriptor } from "react-intl";
import { AiBrain01Icon, Globe02Icon, Task01Icon } from "@hugeicons/core-free-icons";

import type { NavigationIcon } from "@/components/app-shell/navigation-config";

export type FeatureTeaserId = "automations" | "guideline" | "domains";

export type FeatureTeaserScope = "workspace" | "project";

export type FeatureTeaserConfig = {
  icon: NavigationIcon;
  pageLabel: MessageDescriptor;
  pageLabelProject: MessageDescriptor;
  pageTitle: MessageDescriptor;
  pageDescription: MessageDescriptor;
  pageDescriptionProject: MessageDescriptor;
  earlyAccessTitle: MessageDescriptor;
  earlyAccessDescription: MessageDescriptor;
  benefits: readonly MessageDescriptor[];
};

export const featureTeaserMessages = defineMessages({
  previewBadge: {
    defaultMessage: "Preview",
    id: "slYILV02yb",
    description: "Badge shown on feature teaser pages and gated navigation items",
  },
  requestDemo: {
    defaultMessage: "Request a demo",
    id: "oKauJvNSsW",
    description: "Primary call to action on feature teaser pages",
  },
  contactSupport: {
    defaultMessage: "Contact us",
    id: "RcUVixjzZV",
    description: "Secondary call to action on feature teaser pages",
  },
  contactSubjectAutomations: {
    defaultMessage: "Demo request: Automations",
    id: "++6KcoXi6F",
    description: "Email subject for automations feature teaser contact link",
  },
  contactSubjectGuideline: {
    defaultMessage: "Demo request: Guideline",
    id: "BHmWNCONbs",
    description: "Email subject for guideline feature teaser contact link",
  },
  contactSubjectDomains: {
    defaultMessage: "Demo request: Domains",
    id: "XztnKIGYn5",
    description: "Email subject for domains feature teaser contact link",
  },

  automationsPageLabel: {
    defaultMessage: "Workspace",
    id: "SQywnBh/uh",
    description: "Feature teaser page label for workspace automations",
  },
  automationsPageLabelProject: {
    defaultMessage: "Project",
    id: "ioiYh1dY+T",
    description: "Feature teaser page label for project automations",
  },
  automationsTitle: {
    defaultMessage: "Automations",
    id: "uQuuO1WuxO",
    description: "Feature teaser page title for automations",
  },
  automationsDescription: {
    defaultMessage:
      "Put repetitive global content work on autopilot so your team ships to more markets, faster.",
    id: "D3q/aG4RpR",
    description: "Feature teaser page description for workspace automations",
  },
  automationsDescriptionProject: {
    defaultMessage: "Keep this project releasing on time without chasing manual handoffs.",
    id: "99UKjV7Fo4",
    description: "Feature teaser page description for project automations",
  },
  automationsEarlyAccessTitle: {
    defaultMessage: "Ship to more markets without growing the team",
    id: "PG2jivJB3X",
    description: "Feature teaser early access title for automations",
  },
  automationsEarlyAccessDescription: {
    defaultMessage:
      "Automations handles repetitive steps between content, review, and release so your team can focus on quality. Available in early access. Book a demo to see it on your stack.",
    id: "j0WZLPTpqA",
    description: "Feature teaser early access description for automations",
  },
  automationsBenefit0: {
    defaultMessage: "Cut hours lost to manual review and delivery handoffs",
    id: "+je2CrABfF",
    description: "Feature teaser benefit for automations",
  },
  automationsBenefit1: {
    defaultMessage: "Release on schedule, even as locale count grows",
    id: "8JgsbTFb9B",
    description: "Feature teaser benefit for automations",
  },
  automationsBenefit2: {
    defaultMessage: "Scale output without scaling headcount",
    id: "7DcMnrFZgv",
    description: "Feature teaser benefit for automations",
  },

  guidelinePageLabel: {
    defaultMessage: "Workspace",
    id: "Ez0AubJEsT",
    description: "Feature teaser page label for workspace guideline",
  },
  guidelinePageLabelProject: {
    defaultMessage: "Project",
    id: "s0SZ6JCFMT",
    description: "Feature teaser page label for project guideline",
  },
  guidelineTitle: {
    defaultMessage: "Guideline",
    id: "UQT1fdMFbW",
    description: "Feature teaser page title for guideline",
  },
  guidelineDescription: {
    defaultMessage:
      "Capture style, market, and compliance guidance so teams scale into new markets with confidence.",
    id: "4y4y0oNFFl",
    description: "Feature teaser page description for workspace guideline",
  },
  guidelineDescriptionProject: {
    defaultMessage: "Give this project the GTM context it needs to launch and grow in new markets.",
    id: "FcomHiDTaX",
    description: "Feature teaser page description for project guideline",
  },
  guidelineEarlyAccessTitle: {
    defaultMessage: "One playbook for global growth in every market",
    id: "ESsYtK4MNy",
    description: "Feature teaser early access title for guideline",
  },
  guidelineEarlyAccessDescription: {
    defaultMessage:
      "Guideline stores style, market, and compliance rules in one place for teams and AI. Available in early access. Book a demo to see it in action.",
    id: "nY6L1mpX2I",
    description: "Feature teaser early access description for guideline",
  },
  guidelineBenefit0: {
    defaultMessage: "Launch campaigns that fit each market from day one",
    id: "yHuJniMEb/",
    description: "Feature teaser benefit for guideline",
  },
  guidelineBenefit1: {
    defaultMessage: "New regions ramp up faster with shared GTM playbooks",
    id: "66l3idHXx9",
    description: "Feature teaser benefit for guideline",
  },
  guidelineBenefit2: {
    defaultMessage: "Decisions compound as teams learn what works in each market",
    id: "plDoLEcfb7",
    description: "Feature teaser benefit for guideline",
  },

  domainsPageLabel: {
    defaultMessage: "Workspace",
    id: "e39hEFri57",
    description: "Feature teaser page label for domains",
  },
  domainsPageLabelProject: {
    defaultMessage: "Workspace",
    id: "0IVc9Jxawk",
    description: "Feature teaser page label for domains (project scope unused)",
  },
  domainsTitle: {
    defaultMessage: "Domains",
    id: "hSuFqgtras",
    description: "Feature teaser page title for domains",
  },
  domainsDescription: {
    defaultMessage:
      "Audit your websites for localisation, SEO, and AEO. See what is blocking discoverability in every market.",
    id: "2icICV/DAq",
    description: "Feature teaser page description for domains",
  },
  domainsDescriptionProject: {
    defaultMessage:
      "Audit your websites for localisation, SEO, and AEO. See what is blocking discoverability in every market.",
    id: "PyZoyjoXDF",
    description: "Feature teaser page description for domains (project scope unused)",
  },
  domainsEarlyAccessTitle: {
    defaultMessage: "See what is hurting search and AI answers in every locale",
    id: "SWDbxCkEGV",
    description: "Feature teaser early access title for domains",
  },
  domainsEarlyAccessDescription: {
    defaultMessage:
      "Domains crawls your sites and scores localisation, SEO, and AEO readiness. Fix the highest-impact issues first. Available in early access. Book a demo to run an audit.",
    id: "AZAD/rhnHJ",
    description: "Feature teaser early access description for domains",
  },
  domainsBenefit0: {
    defaultMessage: "Find hreflang errors, missing locales, and content gaps",
    id: "iMzelu42WD",
    description: "Feature teaser benefit for domains",
  },
  domainsBenefit1: {
    defaultMessage: "Improve SEO and AEO discoverability across markets",
    id: "J7hBoTRR5O",
    description: "Feature teaser benefit for domains",
  },
  domainsBenefit2: {
    defaultMessage: "Track audit scores and open issues as you expand",
    id: "4Y5ejA62oY",
    description: "Feature teaser benefit for domains",
  },
});

export const featureTeaserRegistry: Record<FeatureTeaserId, FeatureTeaserConfig> = {
  automations: {
    icon: Task01Icon,
    pageLabel: featureTeaserMessages.automationsPageLabel,
    pageLabelProject: featureTeaserMessages.automationsPageLabelProject,
    pageTitle: featureTeaserMessages.automationsTitle,
    pageDescription: featureTeaserMessages.automationsDescription,
    pageDescriptionProject: featureTeaserMessages.automationsDescriptionProject,
    earlyAccessTitle: featureTeaserMessages.automationsEarlyAccessTitle,
    earlyAccessDescription: featureTeaserMessages.automationsEarlyAccessDescription,
    benefits: [
      featureTeaserMessages.automationsBenefit0,
      featureTeaserMessages.automationsBenefit1,
      featureTeaserMessages.automationsBenefit2,
    ],
  },
  guideline: {
    icon: AiBrain01Icon,
    pageLabel: featureTeaserMessages.guidelinePageLabel,
    pageLabelProject: featureTeaserMessages.guidelinePageLabelProject,
    pageTitle: featureTeaserMessages.guidelineTitle,
    pageDescription: featureTeaserMessages.guidelineDescription,
    pageDescriptionProject: featureTeaserMessages.guidelineDescriptionProject,
    earlyAccessTitle: featureTeaserMessages.guidelineEarlyAccessTitle,
    earlyAccessDescription: featureTeaserMessages.guidelineEarlyAccessDescription,
    benefits: [
      featureTeaserMessages.guidelineBenefit0,
      featureTeaserMessages.guidelineBenefit1,
      featureTeaserMessages.guidelineBenefit2,
    ],
  },
  domains: {
    icon: Globe02Icon,
    pageLabel: featureTeaserMessages.domainsPageLabel,
    pageLabelProject: featureTeaserMessages.domainsPageLabelProject,
    pageTitle: featureTeaserMessages.domainsTitle,
    pageDescription: featureTeaserMessages.domainsDescription,
    pageDescriptionProject: featureTeaserMessages.domainsDescriptionProject,
    earlyAccessTitle: featureTeaserMessages.domainsEarlyAccessTitle,
    earlyAccessDescription: featureTeaserMessages.domainsEarlyAccessDescription,
    benefits: [
      featureTeaserMessages.domainsBenefit0,
      featureTeaserMessages.domainsBenefit1,
      featureTeaserMessages.domainsBenefit2,
    ],
  },
};

export const featureTeaserContactSubjects: Record<FeatureTeaserId, MessageDescriptor> = {
  automations: featureTeaserMessages.contactSubjectAutomations,
  guideline: featureTeaserMessages.contactSubjectGuideline,
  domains: featureTeaserMessages.contactSubjectDomains,
};
