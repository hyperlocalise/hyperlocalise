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
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

export type OnboardingWelcomeEmailProps = {
  firstName?: string | null;
  appUrl: string;
  gettingStartedUrl: string;
  mcpDocsUrl: string;
  mcpUrl: string;
  brandLogoUrl: string;
  claudeSnippet: string;
  codexSnippet: string;
};

const PAGE_BG = "#F7F7F7";
const CARD_BG = "#FFFFFF";
const TEXT = "#000000";
const MUTED = "#6B7280";
const LINK = "#2563EB";
const PRIMARY = "#006BFF";
const SNIPPET_BG = "#F4F4F5";

export const ONBOARDING_WELCOME_EMAIL_SUBJECT = "Getting started with Hyperlocalise";

export function onboardingWelcomeGreeting(firstName?: string | null): string {
  const name = displayFirstName(firstName);
  return name
    ? `Hello ${name}, and welcome to Hyperlocalise.`
    : "Hello, and welcome to Hyperlocalise.";
}

export function displayFirstName(firstName?: string | null): string | null {
  const trimmed = firstName?.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > 80) {
    return null;
  }
  return trimmed;
}

export function onboardingWelcomeEmailText(props: OnboardingWelcomeEmailProps): string {
  return [
    onboardingWelcomeGreeting(props.firstName),
    "",
    "Hyperlocalise is infrastructure for multilingual content operations. Create a project, add source files, then review translations in the workspace or connect git, the CLI, and your coding agent.",
    "",
    "Here are a few ways to get started:",
    "",
    "Create a project",
    "Open Projects, name the project, and choose the source locale plus the target locales you need now.",
    "",
    "Add source content",
    "Upload JSON, YAML, XLIFF, PO, or other supported files from Files, or connect GitHub under Integrations.",
    "",
    "Connect Hyperlocalise's MCP",
    "MCP lets your agent read projects, files, glossaries, and jobs in your workspace. Open Overview, pick Claude, Codex, or Cursor, and follow the snippet.",
    "",
    `Claude: ${props.claudeSnippet}`,
    `Codex: ${props.codexSnippet}`,
    `MCP URL: ${props.mcpUrl}`,
    "",
    `Open Hyperlocalise: ${props.appUrl}`,
    `Getting started: ${props.gettingStartedUrl}`,
    `MCP docs: ${props.mcpDocsUrl}`,
    "",
    "You received this because you created a Hyperlocalise account.",
  ].join("\n");
}

export function OnboardingWelcomeEmail({
  firstName,
  appUrl,
  gettingStartedUrl,
  mcpDocsUrl,
  mcpUrl,
  brandLogoUrl,
  claudeSnippet,
  codexSnippet,
}: OnboardingWelcomeEmailProps) {
  const greeting = onboardingWelcomeGreeting(firstName);

  return (
    <Html>
      <Head />
      <Preview>{greeting}</Preview>
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
              margin: "28px 0 16px",
              fontSize: 22,
              fontWeight: 700,
              lineHeight: "30px",
              color: TEXT,
            }}
          >
            {greeting}
          </Heading>

          <Text style={{ margin: "0 0 16px", fontSize: 15, lineHeight: "24px", color: TEXT }}>
            Hyperlocalise is infrastructure for multilingual content operations. Create a project,
            add source files, then review translations in the workspace or connect git, the CLI, and
            your coding agent.
          </Text>

          <Text style={{ margin: "0 0 20px", fontSize: 15, lineHeight: "24px", color: TEXT }}>
            Here are a few ways to get started:
          </Text>

          <Heading
            as="h2"
            style={{
              margin: "0 0 8px",
              fontSize: 16,
              fontWeight: 700,
              lineHeight: "24px",
              color: TEXT,
            }}
          >
            Create a project
          </Heading>
          <Text style={{ margin: "0 0 16px", fontSize: 15, lineHeight: "24px", color: TEXT }}>
            Open <strong>Projects</strong>, name the project, and choose the source locale plus the
            target locales you need now.
          </Text>

          <Heading
            as="h2"
            style={{
              margin: "0 0 8px",
              fontSize: 16,
              fontWeight: 700,
              lineHeight: "24px",
              color: TEXT,
            }}
          >
            Add source content
          </Heading>
          <Text style={{ margin: "0 0 16px", fontSize: 15, lineHeight: "24px", color: TEXT }}>
            Upload JSON, YAML, XLIFF, PO, or other supported files from <strong>Files</strong>, or
            connect GitHub under <strong>Integrations</strong>.
          </Text>

          <Heading
            as="h2"
            style={{
              margin: "0 0 8px",
              fontSize: 16,
              fontWeight: 700,
              lineHeight: "24px",
              color: TEXT,
            }}
          >
            Connect Hyperlocalise&apos;s MCP
          </Heading>
          <Text style={{ margin: "0 0 12px", fontSize: 15, lineHeight: "24px", color: TEXT }}>
            MCP lets your agent read projects, files, glossaries, and jobs in your workspace. Open{" "}
            <strong>Overview</strong>, pick Claude, Codex, or Cursor, and follow the snippet. Setup
            notes are in our{" "}
            <Link href={mcpDocsUrl} style={{ color: LINK, textDecoration: "underline" }}>
              MCP docs
            </Link>
            .
          </Text>
          <Section
            style={{
              marginBottom: 8,
              backgroundColor: SNIPPET_BG,
              borderRadius: 6,
              padding: "10px 12px",
            }}
          >
            <Text
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: "20px",
                color: TEXT,
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                wordBreak: "break-all",
              }}
            >
              {claudeSnippet}
            </Text>
          </Section>
          <Section
            style={{
              marginBottom: 20,
              backgroundColor: SNIPPET_BG,
              borderRadius: 6,
              padding: "10px 12px",
            }}
          >
            <Text
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: "20px",
                color: TEXT,
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                wordBreak: "break-all",
              }}
            >
              {codexSnippet}
            </Text>
          </Section>
          <Text style={{ margin: "0 0 24px", fontSize: 13, lineHeight: "20px", color: MUTED }}>
            MCP URL: {mcpUrl}
          </Text>

          <Section style={{ textAlign: "center" }}>
            <Button
              href={appUrl}
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
              Open Hyperlocalise
            </Button>
          </Section>
        </Container>

        <Container style={{ maxWidth: 560, padding: "16px 8px 0" }}>
          <Text style={{ margin: "0 0 8px", fontSize: 12, color: MUTED }}>
            <Link href={gettingStartedUrl} style={{ color: LINK, textDecoration: "none" }}>
              Getting started
            </Link>
            {" · "}
            <Link href={mcpDocsUrl} style={{ color: LINK, textDecoration: "none" }}>
              MCP docs
            </Link>
          </Text>
          <Text style={{ margin: 0, fontSize: 12, color: MUTED }}>
            You received this because you created a Hyperlocalise account.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default OnboardingWelcomeEmail;
