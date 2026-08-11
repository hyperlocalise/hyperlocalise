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
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { IssueNotificationType } from "@/lib/database/schema/issue-sheet";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";

export type EmailNotificationItem = {
  id: string;
  type: IssueNotificationType;
  issueId: string;
  issueTitle: string;
  issueLabel: string;
  actorName: string;
  actorAvatarUrl?: string | null;
  actorInitials: string;
  actionHref: string;
  excerpt?: string | null;
};

export type IssueInboxNotificationsEmailProps = {
  unreadCount: number;
  notifications: EmailNotificationItem[];
  inboxUrl: string;
  unsubscribeUrl: string;
  brandLogoUrl: string;
};

const PAGE_BG = "#F7F7F7";
const CARD_BG = "#FFFFFF";
const TEXT = "#000000";
const MUTED = "#6B7280";
const LINK = "#2563EB";
const EXCERPT_BG = "#F4F4F5";
const DIVIDER = "#E5E7EB";
const PRIMARY = "#006BFF";
const AVATAR_BG = "#F0A070";

function unreadHeading(count: number): string {
  if (count === 1) {
    return "You have 1 unread notification on Hyperlocalise.";
  }
  return `You have ${count} unread notifications on Hyperlocalise.`;
}

export function issueInboxNotificationsSubject(count: number): string {
  return unreadHeading(count);
}

export function actionVerb(type: IssueNotificationType): string {
  switch (type) {
    case "comment":
      return "commented on";
    case "mentioned":
      return "mentioned you in";
    case "assigned":
      return "assigned the issue to you";
    case "assignee_changed":
      return "changed the assignee on";
    case "status_changed":
      return "changed the status of";
    default:
      return assertNever(type);
  }
}

function groupByIssue(notifications: EmailNotificationItem[]): Array<{
  issueId: string;
  issueLabel: string;
  issueTitle: string;
  items: EmailNotificationItem[];
}> {
  const groups: Array<{
    issueId: string;
    issueLabel: string;
    issueTitle: string;
    items: EmailNotificationItem[];
  }> = [];

  for (const notification of notifications) {
    const last = groups[groups.length - 1];
    if (last && last.issueId === notification.issueId) {
      last.items.push(notification);
      continue;
    }
    groups.push({
      issueId: notification.issueId,
      issueLabel: notification.issueLabel,
      issueTitle: notification.issueTitle,
      items: [notification],
    });
  }

  return groups;
}

function Avatar({
  actorAvatarUrl,
  actorInitials,
  actorName,
}: {
  actorAvatarUrl?: string | null;
  actorInitials: string;
  actorName: string;
}) {
  if (actorAvatarUrl) {
    return (
      <Img
        src={actorAvatarUrl}
        width={28}
        height={28}
        alt={actorName}
        style={{
          borderRadius: "999px",
          display: "block",
          objectFit: "cover",
        }}
      />
    );
  }

  return (
    <Section
      style={{
        width: 28,
        height: 28,
        borderRadius: "999px",
        backgroundColor: AVATAR_BG,
        textAlign: "center",
      }}
    >
      <Text
        style={{
          margin: 0,
          color: "#FFFFFF",
          fontSize: 11,
          fontWeight: 600,
          lineHeight: "28px",
        }}
      >
        {actorInitials}
      </Text>
    </Section>
  );
}

function NotificationRow({ item }: { item: EmailNotificationItem }) {
  const verb = actionVerb(item.type);
  const showIssueLinkSuffix =
    item.type === "assigned" || item.type === "assignee_changed" || item.type === "status_changed";

  return (
    <Section style={{ marginBottom: 16 }}>
      <Row>
        <Column style={{ width: 36, verticalAlign: "top" }}>
          <Avatar
            actorAvatarUrl={item.actorAvatarUrl}
            actorInitials={item.actorInitials}
            actorName={item.actorName}
          />
        </Column>
        <Column style={{ verticalAlign: "top" }}>
          <Text style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: TEXT }}>
            <span style={{ fontWeight: 600 }}>{item.actorName}</span>{" "}
            <Link href={item.actionHref} style={{ color: LINK, textDecoration: "none" }}>
              {verb}
            </Link>
            {showIssueLinkSuffix ? (
              <>
                {": "}
                <Link href={item.actionHref} style={{ color: LINK, textDecoration: "none" }}>
                  {item.issueLabel} {item.issueTitle}
                </Link>
              </>
            ) : (
              " the issue:"
            )}
          </Text>
          {item.excerpt ? (
            <Section
              style={{
                marginTop: 8,
                backgroundColor: EXCERPT_BG,
                borderRadius: 6,
                padding: "10px 12px",
              }}
            >
              <Text style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: TEXT }}>
                {item.excerpt}
              </Text>
            </Section>
          ) : null}
        </Column>
      </Row>
    </Section>
  );
}

export function IssueInboxNotificationsEmail({
  unreadCount,
  notifications,
  inboxUrl,
  unsubscribeUrl,
  brandLogoUrl,
}: IssueInboxNotificationsEmailProps) {
  const heading = unreadHeading(unreadCount);
  const groups = groupByIssue(notifications);

  return (
    <Html>
      <Head />
      <Preview>{heading}</Preview>
      <Body
        style={{
          backgroundColor: PAGE_BG,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          margin: 0,
          padding: "32px 12px",
        }}
      >
        <Container
          style={{
            backgroundColor: CARD_BG,
            borderRadius: 8,
            maxWidth: 560,
            padding: "40px 40px 32px",
          }}
        >
          <Section>
            <Row>
              <Column style={{ width: 28, verticalAlign: "middle" }}>
                <Img
                  src={brandLogoUrl}
                  width={24}
                  height={24}
                  alt="Hyperlocalise"
                  style={{ display: "block" }}
                />
              </Column>
              <Column style={{ verticalAlign: "middle", paddingLeft: 8 }}>
                <Text
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 700,
                    color: TEXT,
                    lineHeight: "24px",
                  }}
                >
                  Hyperlocalise
                </Text>
              </Column>
            </Row>
          </Section>

          <Heading
            as="h1"
            style={{
              margin: "28px 0 24px",
              fontSize: 22,
              fontWeight: 700,
              lineHeight: "30px",
              color: TEXT,
            }}
          >
            {heading}
          </Heading>

          <Hr style={{ borderColor: DIVIDER, margin: "0 0 24px" }} />

          {groups.map((group) => (
            <Section key={group.issueId} style={{ marginBottom: 8 }}>
              <Text
                style={{
                  margin: "0 0 12px",
                  fontSize: 13,
                  lineHeight: "18px",
                  color: MUTED,
                }}
              >
                {group.issueLabel} {group.issueTitle}
              </Text>
              {group.items.map((item) => (
                <NotificationRow key={item.id} item={item} />
              ))}
            </Section>
          ))}

          <Hr style={{ borderColor: DIVIDER, margin: "16px 0 24px" }} />

          <Section style={{ textAlign: "center" }}>
            <Button
              href={inboxUrl}
              style={{
                backgroundColor: PRIMARY,
                borderRadius: 6,
                color: "#FFFFFF",
                display: "inline-block",
                fontSize: 14,
                fontWeight: 600,
                lineHeight: "20px",
                padding: "10px 18px",
                textDecoration: "none",
              }}
            >
              Open your Inbox
            </Button>
          </Section>
        </Container>

        <Container style={{ maxWidth: 560, padding: "16px 8px 0" }}>
          <Row>
            <Column>
              <Text style={{ margin: 0, fontSize: 12, color: MUTED }}>Hyperlocalise</Text>
            </Column>
            <Column align="right">
              <Link
                href={unsubscribeUrl}
                style={{ color: LINK, fontSize: 12, textDecoration: "none" }}
              >
                Unsubscribe
              </Link>
            </Column>
          </Row>
        </Container>
      </Body>
    </Html>
  );
}

export function issueInboxNotificationsPlainText(props: IssueInboxNotificationsEmailProps): string {
  const lines = [unreadHeading(props.unreadCount), ""];

  for (const group of groupByIssue(props.notifications)) {
    lines.push(`${group.issueLabel} ${group.issueTitle}`);
    for (const item of group.items) {
      const verb = actionVerb(item.type);
      lines.push(`- ${item.actorName} ${verb} the issue`);
      if (item.excerpt) {
        lines.push(`  "${item.excerpt}"`);
      }
    }
    lines.push("");
  }

  lines.push(`Open your Inbox: ${props.inboxUrl}`);
  lines.push(`Unsubscribe: ${props.unsubscribeUrl}`);
  return lines.join("\n");
}

export default IssueInboxNotificationsEmail;
