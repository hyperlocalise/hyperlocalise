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

import { SITE_URL } from "@/lib/seo/site-url";

export type OnboardingWelcomeEmailProps = {
  firstName?: string | null;
  appUrl: string;
  gettingStartedUrl: string;
  mcpDocsUrl: string;
  cliDocsUrl: string;
  mcpUrl: string;
  brandLogoUrl: string;
  claudeSnippet: string;
  codexSnippet: string;
};

export const ONBOARDING_CLI_GITHUB_ACTION_SNIPPET =
  "- uses: hyperlocalise/hyperlocalise/install@v1";

const PAGE_BG = "#F7F7F7";
const CARD_BG = "#FFFFFF";
const TEXT = "#000000";
const MUTED = "#6B7280";
const LINK = "#2563EB";
const MESH_LINK = "#BFDBFE";
const PRIMARY = "#006BFF";
const SNIPPET_BG = "rgba(255,255,255,0.94)";
const MESH_HEADING = "#FFFFFF";
const MESH_BODY = "#F3F4F6";
const MESH_MUTED = "#E5E7EB";

export const ONBOARDING_SECTION_MESHES = {
  project: `${SITE_URL}/images/mesh/mesh-gradient-1784863888954.jpg`,
  files: `${SITE_URL}/images/mesh/mesh-gradient-1784864073608.jpg`,
  cli: `${SITE_URL}/images/mesh/mesh-gradient-1784864042890.jpg`,
  mcp: `${SITE_URL}/images/mesh/mesh-gradient-1784863799475.jpg`,
} as const;

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
    "Use the CLI in GitHub Actions",
    "When source files live in a repo, install the CLI in CI, store an organization API key as HYPERLOCALISE_API_KEY, and run sync push to upload sources.",
    "",
    ONBOARDING_CLI_GITHUB_ACTION_SNIPPET,
    "Then: hyperlocalise sync push",
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
    `CLI in GitHub Actions: ${props.cliDocsUrl}`,
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
  cliDocsUrl,
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

          <OnboardingMeshSection
            title="Create a project"
            meshSrc={ONBOARDING_SECTION_MESHES.project}
          >
            <Text style={meshBodyText}>
              Open <strong>Projects</strong>, name the project, and choose the source locale plus
              the target locales you need now.
            </Text>
          </OnboardingMeshSection>

          <OnboardingMeshSection
            title="Add source content"
            meshSrc={ONBOARDING_SECTION_MESHES.files}
          >
            <Text style={meshBodyText}>
              Upload JSON, YAML, XLIFF, PO, or other supported files from <strong>Files</strong>, or
              connect GitHub under <strong>Integrations</strong>.
            </Text>
          </OnboardingMeshSection>

          <OnboardingMeshSection
            title="Use the CLI in GitHub Actions"
            meshSrc={ONBOARDING_SECTION_MESHES.cli}
          >
            <Text style={meshBodyText}>
              When source files live in a repo, install the CLI in CI, store an organization API key
              as <strong>HYPERLOCALISE_API_KEY</strong>, and run{" "}
              <code style={inlineCode}>hyperlocalise sync push</code> to upload sources. Setup notes
              are in our{" "}
              <Link href={cliDocsUrl} style={{ color: MESH_LINK, textDecoration: "underline" }}>
                GitHub Actions docs
              </Link>
              .
            </Text>
            <Section style={snippetCard}>
              <Text style={snippetText}>{ONBOARDING_CLI_GITHUB_ACTION_SNIPPET}</Text>
            </Section>
          </OnboardingMeshSection>

          <OnboardingMeshSection
            title="Connect Hyperlocalise's MCP"
            meshSrc={ONBOARDING_SECTION_MESHES.mcp}
          >
            <Text style={meshBodyText}>
              MCP lets your agent read projects, files, glossaries, and jobs in your workspace. Open{" "}
              <strong>Overview</strong>, pick Claude, Codex, or Cursor, and follow the snippet.
              Setup notes are in our{" "}
              <Link href={mcpDocsUrl} style={{ color: MESH_LINK, textDecoration: "underline" }}>
                MCP docs
              </Link>
              .
            </Text>
            <Section style={{ ...snippetCard, marginBottom: 8 }}>
              <Text style={snippetText}>{claudeSnippet}</Text>
            </Section>
            <Section style={snippetCard}>
              <Text style={snippetText}>{codexSnippet}</Text>
            </Section>
            <Text style={{ ...meshBodyText, fontSize: 13, color: MESH_MUTED, marginBottom: 0 }}>
              MCP URL: {mcpUrl}
            </Text>
          </OnboardingMeshSection>

          <Section style={{ textAlign: "center", marginTop: 8 }}>
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
            <Link href={cliDocsUrl} style={{ color: LINK, textDecoration: "none" }}>
              CLI in GitHub Actions
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

function OnboardingMeshSection({
  title,
  meshSrc,
  children,
}: {
  title: string;
  meshSrc: string;
  children: ReactNode;
}) {
  return (
    <Section
      style={{
        backgroundColor: "#2A2420",
        backgroundImage: `linear-gradient(180deg, rgba(12,12,12,0.32) 0%, rgba(12,12,12,0.55) 100%), url(${meshSrc})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        borderRadius: 16,
        padding: "22px 20px",
        marginBottom: 16,
      }}
    >
      <Heading as="h2" style={meshHeading}>
        {title}
      </Heading>
      {children}
    </Section>
  );
}

const meshHeading = {
  margin: "0 0 10px",
  fontSize: 20,
  fontWeight: 700,
  lineHeight: "26px",
  color: MESH_HEADING,
};

const meshBodyText = {
  margin: "0 0 12px",
  fontSize: 15,
  lineHeight: "24px",
  color: MESH_BODY,
};

const snippetCard = {
  backgroundColor: SNIPPET_BG,
  borderRadius: 6,
  padding: "10px 12px",
  marginBottom: 12,
};

const snippetText = {
  margin: 0,
  fontSize: 13,
  lineHeight: "20px",
  color: TEXT,
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  wordBreak: "break-all" as const,
};

const inlineCode = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: 13,
};

export default OnboardingWelcomeEmail;
