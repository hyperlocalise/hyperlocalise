/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 * ...
 */
import Image from "next/image";
import { siGithub } from "simple-icons";
import { FormattedMessage, defineMessages } from "react-intl";

const messages = defineMessages({
  label: {
    defaultMessage: "Works with your existing tools",
    id: "Fmf1wikCZt",
    description: "Integration strip label on the agents-automation hero",
  },
});

const INTEGRATIONS = [
  {
    id: "github",
    label: "GitHub",
    type: "simple-icon" as const,
    icon: siGithub,
  },
  {
    id: "slack",
    label: "Slack",
    type: "image" as const,
    src: "/images/slack-logo.svg",
  },
  {
    id: "contentful",
    label: "Contentful",
    type: "image" as const,
    src: "/images/contentful-logo.svg",
  },
];

export function IntegrationStripSection() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground whitespace-nowrap">
        <FormattedMessage {...messages.label} />
      </p>
      <div className="flex items-center gap-6">
        {INTEGRATIONS.map((integration) => (
          <div
            key={integration.id}
            className="flex items-center gap-2 opacity-60 grayscale transition-all hover:opacity-100 hover:grayscale-0"
          >
            {integration.type === "simple-icon" ? (
              <svg role="img" viewBox="0 0 24 24" className="h-5 w-5 fill-foreground">
                <path d={integration.icon.path} />
              </svg>
            ) : (
              <Image
                src={integration.src}
                alt={integration.label}
                width={80}
                height={24}
                className="h-5 w-auto object-contain"
              />
            )}
            <span className="text-sm font-medium text-muted-foreground">{integration.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
