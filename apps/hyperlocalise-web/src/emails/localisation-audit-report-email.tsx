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
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "react-email";

import {
  getLocalisationAuditGuideHref,
  getLocalisationAuditResultCopy,
} from "@/components/marketing/localisation-audit/localisation-audit-page-content";
import { sanitizeLocalisationAuditFindingUrl } from "@/lib/localisation-audit/finding-url";
import {
  emailAuditToneColor,
  emailAuditToneFill,
  formatDimensionScore,
  scoreTone,
  severityTone,
} from "@/lib/localisation-audit/score-tone";
import type {
  LocalisationAuditDimensionScores,
  LocalisationAuditFinding,
} from "@/lib/localisation-audit/types";
import { SITE_URL } from "@/lib/seo/site-url";

export type LocalisationAuditReportEmailProps = {
  domainKey: string;
  score: number;
  completedAt: string;
  findings: LocalisationAuditFinding[];
  verifyUrl: string;
  dimensionScores?: LocalisationAuditDimensionScores;
};

const reportCopy = getLocalisationAuditResultCopy("en");

function formatFindingPlainText(
  finding: LocalisationAuditFinding,
  index: number,
  domainKey: string,
) {
  const lines = [`${index + 1}. [${finding.severity}] ${finding.title}`];
  if (finding.summary) {
    lines.push(finding.summary);
  }
  if (finding.where) {
    lines.push(`${reportCopy.findingWhereLabel}: ${finding.where}`);
  }
  const findingHref = sanitizeLocalisationAuditFindingUrl(finding.url, domainKey);
  if (findingHref) {
    lines.push(findingHref);
  }
  if (finding.evidence) {
    lines.push(`${reportCopy.findingEvidenceLabel}: ${finding.evidence}`);
  }
  if (finding.advice) {
    lines.push(`${reportCopy.findingAdviceLabel}: ${finding.advice}`);
  }
  return lines.join("\n");
}

export function localisationAuditReportEmailText(props: LocalisationAuditReportEmailProps) {
  const findings = props.findings
    .slice(0, 3)
    .map((finding, index) => formatFindingPlainText(finding, index, props.domainKey))
    .join("\n\n");

  const dimensions = props.dimensionScores
    ? [
        `Technical: ${formatDimensionScore(props.dimensionScores.technical)}`,
        `Linguistic: ${formatDimensionScore(props.dimensionScores.linguistic)}`,
        `Contextual: ${formatDimensionScore(props.dimensionScores.contextual)}`,
        `Visual: ${formatDimensionScore(props.dimensionScores.visual)}`,
      ].join(" · ")
    : null;

  return [
    `Your localisation audit for ${props.domainKey} is ready.`,
    "",
    `Score: ${props.score}/100`,
    ...(dimensions ? [dimensions, ""] : []),
    `Audited: ${props.completedAt}`,
    "",
    "Top findings:",
    findings || "No headline findings.",
    "",
    "Open your full report (link expires in 24 hours):",
    props.verifyUrl,
    "",
    "How we score localisation audits:",
    localisationAuditGuideUrl(),
    "",
    "If you did not request this audit, you can ignore this email.",
    "",
    "— Hyperlocalise",
  ].join("\n");
}

export function LocalisationAuditReportEmail(props: LocalisationAuditReportEmailProps) {
  const preview = `${props.domainKey} scored ${props.score}/100 — open your full localisation audit`;
  const scoreColor = emailAuditToneColor(scoreTone(props.score));

  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Your localisation audit is ready</Heading>
          <Text style={text}>
            We finished sampling <strong>{props.domainKey}</strong>. Your teaser score is{" "}
            <strong style={{ color: scoreColor }}>{props.score}/100</strong>.
          </Text>
          {props.dimensionScores ? (
            <Section style={dimensionRow}>
              <Row>
                <Column style={dimensionColumn}>
                  <EmailDimensionCircle label="Technical" score={props.dimensionScores.technical} />
                </Column>
                <Column style={dimensionColumn}>
                  <EmailDimensionCircle
                    label="Linguistic"
                    score={props.dimensionScores.linguistic}
                  />
                </Column>
                <Column style={dimensionColumn}>
                  <EmailDimensionCircle
                    label="Contextual"
                    score={props.dimensionScores.contextual}
                  />
                </Column>
                <Column style={dimensionColumn}>
                  <EmailDimensionCircle label="Visual" score={props.dimensionScores.visual} />
                </Column>
              </Row>
            </Section>
          ) : null}
          <Text style={muted}>Audited {props.completedAt}</Text>
          <Hr style={hr} />
          <Heading as="h2" style={subheading}>
            Top findings
          </Heading>
          {props.findings.slice(0, 3).map((finding) => {
            const toneColor = emailAuditToneColor(severityTone(finding.severity));
            const findingHref = sanitizeLocalisationAuditFindingUrl(finding.url, props.domainKey);
            return (
              <Section
                key={finding.id}
                style={{
                  ...findingBlock,
                  borderLeft: `3px solid ${toneColor}`,
                  paddingLeft: "12px",
                }}
              >
                <Text style={findingTitle}>
                  <span style={{ color: toneColor }}>{finding.severity.toUpperCase()}</span>
                  {" · "}
                  {finding.title}
                </Text>
                <Text style={muted}>{finding.summary}</Text>
                {finding.where || findingHref ? (
                  <>
                    <Text style={detailLabel}>{reportCopy.findingWhereLabel}</Text>
                    {finding.where ? <Text style={detailBody}>{finding.where}</Text> : null}
                    {findingHref ? (
                      <Link href={findingHref} style={findingUrl}>
                        {findingHref}
                      </Link>
                    ) : null}
                  </>
                ) : null}
                {finding.evidence ? (
                  <>
                    <Text style={detailLabel}>{reportCopy.findingEvidenceLabel}</Text>
                    <Text style={evidenceBody}>{finding.evidence}</Text>
                  </>
                ) : null}
                {finding.advice ? (
                  <>
                    <Text style={detailLabel}>{reportCopy.findingAdviceLabel}</Text>
                    <Text style={detailBody}>{finding.advice}</Text>
                  </>
                ) : null}
              </Section>
            );
          })}
          <Section style={ctaSection}>
            <Button href={props.verifyUrl} style={button}>
              Open full report
            </Button>
          </Section>
          <Text style={muted}>
            This link verifies your email and unlocks the full report. It expires in 24 hours and
            can be used once.
          </Text>
          <Text style={muted}>
            <Link href={localisationAuditGuideUrl()} style={link}>
              How we score localisation audits
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function localisationAuditGuideUrl() {
  return `${SITE_URL}${getLocalisationAuditGuideHref()}`;
}

function EmailDimensionCircle({ label, score }: { label: string; score: number | null }) {
  const tone = scoreTone(score);
  const color = emailAuditToneColor(tone);
  const fill = emailAuditToneFill(tone);
  return (
    <>
      <Section
        style={{
          ...dimensionCircle,
          backgroundColor: fill,
        }}
      >
        <Text
          style={{
            ...dimensionCircleScore,
            color,
            fontSize: score == null ? "13px" : "18px",
          }}
        >
          {formatDimensionScore(score)}
        </Text>
      </Section>
      <Text style={dimensionLabel}>{label}</Text>
    </>
  );
}

const body = {
  backgroundColor: "#f6f7f9",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "32px 24px",
  maxWidth: "560px",
  borderRadius: "12px",
};

const heading = {
  fontSize: "24px",
  lineHeight: "32px",
  fontWeight: 600,
  color: "#111827",
  margin: "0 0 16px",
};

const subheading = {
  fontSize: "16px",
  lineHeight: "24px",
  fontWeight: 600,
  color: "#111827",
  margin: "0 0 12px",
};

const text = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#374151",
  margin: "0 0 8px",
};

const muted = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#6b7280",
  margin: "0 0 8px",
};

const dimensionRow = {
  margin: "16px 0 8px",
};

const dimensionColumn = {
  width: "25%",
  textAlign: "center" as const,
  verticalAlign: "top" as const,
};

const dimensionCircle = {
  width: "56px",
  height: "56px",
  borderRadius: "28px",
  margin: "0 auto",
  textAlign: "center" as const,
};

const dimensionCircleScore = {
  margin: 0,
  fontSize: "18px",
  lineHeight: "56px",
  fontWeight: 600,
};

const dimensionLabel = {
  fontSize: "12px",
  lineHeight: "16px",
  color: "#6b7280",
  margin: "8px 0 0",
  textAlign: "center" as const,
};

const hr = {
  borderColor: "#e5e7eb",
  margin: "20px 0",
};

const findingBlock = {
  marginBottom: "12px",
};

const findingTitle = {
  fontSize: "14px",
  lineHeight: "20px",
  fontWeight: 600,
  color: "#111827",
  margin: "0 0 4px",
};

const detailLabel = {
  fontSize: "11px",
  lineHeight: "16px",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  color: "#6b7280",
  margin: "8px 0 2px",
};

const detailBody = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#374151",
  margin: "0 0 4px",
};

const evidenceBody = {
  ...detailBody,
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  whiteSpace: "pre-wrap" as const,
};

const findingUrl = {
  color: "#006bff",
  fontSize: "13px",
  lineHeight: "20px",
  wordBreak: "break-all" as const,
};

const ctaSection = {
  margin: "24px 0",
};

const button = {
  backgroundColor: "#111827",
  borderRadius: "8px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: 600,
  lineHeight: "20px",
  padding: "12px 18px",
  textDecoration: "none",
};

const link = {
  color: "#006bff",
  textDecoration: "underline",
};
