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
import { useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { render } from "@react-email/render";
import { expect, waitFor, within } from "storybook/test";

import { onboardingWelcomeEmailFixture } from "./onboarding-welcome-email.fixture";
import {
  OnboardingWelcomeEmail,
  type OnboardingWelcomeEmailProps,
} from "./onboarding-welcome-email";

type EmailStoryArgs = OnboardingWelcomeEmailProps;

function EmailHtmlPreview({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(800);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }

    function resize() {
      const doc = iframe?.contentDocument;
      if (!doc?.body) {
        return;
      }
      const nextHeight = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, 600);
      setHeight(nextHeight + 24);
    }

    iframe.addEventListener("load", resize);
    resize();
    return () => iframe.removeEventListener("load", resize);
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      title="Onboarding welcome email preview"
      srcDoc={html}
      style={{
        display: "block",
        width: "100%",
        height,
        border: 0,
        backgroundColor: "#F7F7F7",
      }}
    />
  );
}

async function emailCanvas(canvasElement: HTMLElement) {
  const iframe = canvasElement.querySelector("iframe");
  await expect(iframe).toBeTruthy();
  await waitFor(async () => {
    await expect(iframe!.contentDocument?.body).toBeTruthy();
    await expect(iframe!.contentDocument!.body.innerHTML.length).toBeGreaterThan(0);
  });
  return within(iframe!.contentDocument!.body);
}

const meta = {
  title: "Emails/Onboarding Welcome",
  parameters: {
    layout: "fullscreen",
    themes: { themeOverride: "light" },
  },
  args: onboardingWelcomeEmailFixture,
  loaders: [
    async (context) => {
      const args = context.args as EmailStoryArgs;
      const html = await render(<OnboardingWelcomeEmail {...args} />);
      return { html };
    },
  ],
  render: (_args, { loaded }) => {
    const html = typeof loaded.html === "string" ? loaded.html : "";
    return <EmailHtmlPreview html={html} />;
  },
} satisfies Meta<EmailStoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NamedRecipient: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await emailCanvas(canvasElement);
    await expect(canvas.getByText("Hello Dev, and welcome to Hyperlocalise.")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Open Hyperlocalise" })).toBeInTheDocument();
    await expect(canvas.getByText(onboardingWelcomeEmailFixture.claudeSnippet)).toBeInTheDocument();
    await expect(canvas.getByText("Use the CLI in GitHub Actions")).toBeInTheDocument();
  },
};

export const AnonymousRecipient: Story = {
  args: {
    firstName: null,
  },
  play: async ({ canvasElement }) => {
    const canvas = await emailCanvas(canvasElement);
    await expect(canvas.getByText("Hello, and welcome to Hyperlocalise.")).toBeInTheDocument();
  },
};
