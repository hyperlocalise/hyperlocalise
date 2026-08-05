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

import { slackLaunchIntakeIllustrationMessages } from "./slack-launch-intake-illustration.messages";

const SLACK_COLORS = {
  blue: "#36c5f0",
  green: "#2eb67d",
  yellow: "#ecb22e",
  red: "#e01e5a",
} as const;

export type ConvoStep = {
  id: string;
  agentReply: ReactNode;
};

function BulletList({ items }: { items: { color: string; text: ReactNode }[] }) {
  return (
    <ul className="mt-2 space-y-1 text-[0.78rem] leading-5 text-foreground/88">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span
            className="mt-2 size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

const intakeItems = [
  slackLaunchIntakeIllustrationMessages.intakeItemDesign,
  slackLaunchIntakeIllustrationMessages.intakeItemLayers,
  slackLaunchIntakeIllustrationMessages.intakeItemLocales,
  slackLaunchIntakeIllustrationMessages.intakeItemReview,
] as const;

export const CONVO_STEPS: ConvoStep[] = [
  {
    id: "step-2",
    agentReply: (
      <div>
        <p>
          <FormattedMessage {...slackLaunchIntakeIllustrationMessages.agentSummaryIntro} />
        </p>
        <BulletList
          items={[
            { color: SLACK_COLORS.blue, text: <FormattedMessage {...intakeItems[0]} /> },
            { color: SLACK_COLORS.green, text: <FormattedMessage {...intakeItems[1]} /> },
            { color: SLACK_COLORS.yellow, text: <FormattedMessage {...intakeItems[2]} /> },
            { color: SLACK_COLORS.red, text: <FormattedMessage {...intakeItems[3]} /> },
          ]}
        />
        <p className="mt-2.5">
          <FormattedMessage {...slackLaunchIntakeIllustrationMessages.agentSummaryOutro} />
        </p>
      </div>
    ),
  },
  {
    id: "step-3",
    agentReply: (
      <p>
        <FormattedMessage {...slackLaunchIntakeIllustrationMessages.agentConfirmation} />
      </p>
    ),
  },
];
