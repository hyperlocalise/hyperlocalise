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

import {
  allTypesNotifications,
  assignedNotification,
  commentNotification,
  digestMultipleIssuesNotifications,
  digestSameIssueNotifications,
  emailStoryBrandLogoUrl,
  emailStoryInboxUrl,
  emailStoryUnsubscribeUrl,
} from "./issue-inbox-notifications-email.fixture";
import {
  IssueInboxNotificationsEmail,
  type IssueInboxNotificationsEmailProps,
} from "./issue-inbox-notifications-email";

type EmailStoryArgs = IssueInboxNotificationsEmailProps;

/**
 * Preview React Email output in an iframe so Storybook/Tailwind global CSS
 * cannot override the email's inline styles.
 */
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
      title="Issue inbox email preview"
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
  expect(iframe).toBeTruthy();
  await waitFor(() => {
    expect(iframe!.contentDocument?.body).toBeTruthy();
    expect(iframe!.contentDocument!.body.innerHTML.length).toBeGreaterThan(0);
  });
  return within(iframe!.contentDocument!.body);
}

const meta = {
  title: "Emails/Issue Inbox Notifications",
  parameters: {
    layout: "fullscreen",
    // Keep Storybook chrome from forcing dark theme onto the email surface.
    themes: { themeOverride: "light" },
  },
  args: {
    brandLogoUrl: emailStoryBrandLogoUrl,
    inboxUrl: emailStoryInboxUrl,
    unsubscribeUrl: emailStoryUnsubscribeUrl,
    unreadCount: 1,
    notifications: [commentNotification],
  } satisfies EmailStoryArgs,
  loaders: [
    async (context) => {
      const args = context.args as EmailStoryArgs;
      // Full HTML document — iframe needs <html>/<body>, not a fragment.
      const html = await render(<IssueInboxNotificationsEmail {...args} />);
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

export const SingleComment: Story = {
  args: {
    unreadCount: 1,
    notifications: [commentNotification],
  },
  play: async ({ canvasElement }) => {
    const canvas = await emailCanvas(canvasElement);
    await expect(
      canvas.getByText("You have 1 unread notification on Hyperlocalise."),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Open your Inbox" })).toBeInTheDocument();
    await expect(canvas.getByText("Jules PR")).toBeInTheDocument();
  },
};

export const SingleAssigned: Story = {
  args: {
    unreadCount: 1,
    notifications: [assignedNotification],
  },
  play: async ({ canvasElement }) => {
    const canvas = await emailCanvas(canvasElement);
    await expect(canvas.getByText("assigned the issue to you")).toBeInTheDocument();
  },
};

export const DigestSameIssue: Story = {
  args: {
    unreadCount: 2,
    notifications: digestSameIssueNotifications,
  },
  play: async ({ canvasElement }) => {
    const canvas = await emailCanvas(canvasElement);
    await expect(
      canvas.getByText("You have 2 unread notifications on Hyperlocalise."),
    ).toBeInTheDocument();
    await expect(canvas.getByText(/TRIP-1421/)).toBeInTheDocument();
  },
};

export const DigestMultipleIssues: Story = {
  args: {
    unreadCount: 4,
    notifications: digestMultipleIssuesNotifications,
  },
};

export const AllTypes: Story = {
  args: {
    unreadCount: allTypesNotifications.length,
    notifications: allTypesNotifications,
  },
};
