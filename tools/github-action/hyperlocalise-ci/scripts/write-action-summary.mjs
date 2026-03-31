#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const [, , checkName, configPath, reportPath, summaryPath, cliExitCodeRaw] = process.argv

if (!checkName || !configPath || !reportPath || !summaryPath || cliExitCodeRaw === undefined) {
  console.error('usage: write-action-summary.mjs <check> <config-path> <report-path> <summary-path> <cli-exit-code>')
  process.exit(1)
}

if (checkName !== 'drift' && checkName !== 'check') {
  console.error(`unsupported check: ${checkName}`)
  process.exit(1)
}

const maxAnnotations = 50
const cliExitCode = Number.parseInt(cliExitCodeRaw, 10)
const reportExists = fs.existsSync(reportPath)
const annotationsEnabled = (process.env.GITHUB_ANNOTATIONS_ENABLED ?? 'true') === 'true'
const lines = []

lines.push(`check=${checkName}`)
lines.push(`config_path=${configPath}`)
lines.push(`cli_exit_code=${Number.isNaN(cliExitCode) ? cliExitCodeRaw : cliExitCode}`)
lines.push(`report_path=${reportPath}`)
setDefaultCountOutputs()

if (!reportExists) {
  lines.push('report_found=false')
  if (checkName === 'drift') {
    lines.push('drift_detected=unknown')
    setOutput('drift-detected', 'unknown')
  } else {
    lines.push('findings_detected=unknown')
    setOutput('findings-detected', 'unknown')
  }
  lines.push('note=CLI did not produce a report. Check the workflow log for the failure details.')
  writeSummary(summaryPath, lines)
  writeStepSummary(renderMissingReportMarkdown(checkName, configPath, reportPath, cliExitCodeRaw))
  process.exit(0)
}

let report
try {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
} catch (error) {
  lines.push('report_found=true')
  if (checkName === 'drift') {
    lines.push('drift_detected=unknown')
    setOutput('drift-detected', 'unknown')
  } else {
    lines.push('findings_detected=unknown')
    setOutput('findings-detected', 'unknown')
  }
  lines.push(`note=Failed to parse report JSON: ${error.message}`)
  writeSummary(summaryPath, lines)
  writeStepSummary(renderParseErrorMarkdown(checkName, configPath, reportPath, error.message))
  process.exit(0)
}

if (checkName === 'drift') {
  writeDriftSummary(reportPath, summaryPath, report, lines)
} else {
  writeCheckSummary(summaryPath, report, lines)
}

function writeDriftSummary(reportPath, summaryPath, report, lines) {
  const executable = Array.isArray(report.executable) ? report.executable : []
  const pruneCandidates = Array.isArray(report.pruneCandidates) ? report.pruneCandidates : []
  const warnings = Array.isArray(report.warnings) ? report.warnings : []
  const failures = Array.isArray(report.failures) ? report.failures : []

  const driftDetected = executable.length > 0 || pruneCandidates.length > 0

  lines.push('report_found=true')
  lines.push(`drift_detected=${driftDetected}`)
  lines.push(`planned_total=${numberOrFallback(report.plannedTotal)}`)
  lines.push(`executable_total=${numberOrFallback(report.executableTotal)}`)
  lines.push(`skipped_by_lock=${numberOrFallback(report.skippedByLock)}`)
  lines.push(`prune_candidates=${pruneCandidates.length}`)
  lines.push(`warnings=${warnings.length}`)
  lines.push(`failures=${failures.length}`)

  const targetPaths = uniqueSorted([
    ...executable.map((task) => task?.targetPath).filter(Boolean),
    ...pruneCandidates.map((candidate) => candidate?.targetPath).filter(Boolean),
  ])
  const targetLocales = uniqueSorted(executable.map((task) => task?.targetLocale).filter(Boolean))
  const entryKeys = uniqueSorted([
    ...executable.map((task) => task?.entryKey).filter(Boolean),
    ...pruneCandidates.map((candidate) => candidate?.entryKey).filter(Boolean),
  ])

  lines.push(`affected_target_paths=${targetPaths.length}`)
  for (const targetPath of targetPaths) {
    lines.push(`target_path=${targetPath}`)
  }

  lines.push(`affected_target_locales=${targetLocales.length}`)
  for (const locale of targetLocales) {
    lines.push(`target_locale=${locale}`)
  }

  lines.push(`affected_entry_keys=${entryKeys.length}`)
  for (const key of entryKeys.slice(0, 100)) {
    lines.push(`entry_key=${key}`)
  }
  if (entryKeys.length > 100) {
    lines.push(`note=Entry key list truncated at 100 items (${entryKeys.length - 100} more omitted).`)
  }

  if (targetPaths.length === 0 && targetLocales.length === 0 && entryKeys.length === 0) {
    lines.push('note=The drift report did not include file-level or locale-level details.')
  }

  setOutput('drift-detected', String(driftDetected))
  setCountOutputs({ total: failures.length + warnings.length, error: failures.length, warning: warnings.length })
  lines.push(`findings_total=${failures.length + warnings.length}`)
  lines.push(`error_count=${failures.length}`)
  lines.push(`warning_count=${warnings.length}`)
  writeSummary(summaryPath, lines)
  writeStepSummary(renderDriftMarkdown({
    configPath,
    reportPath,
    cliExitCode,
    driftDetected,
    plannedTotal: numberOrFallback(report.plannedTotal),
    executableTotal: numberOrFallback(report.executableTotal),
    skippedByLock: numberOrFallback(report.skippedByLock),
    pruneCandidates: pruneCandidates.length,
    warnings: warnings.length,
    failures: failures.length,
  }))
}

function writeCheckSummary(summaryPath, report, lines) {
  const checks = Array.isArray(report.checks) ? report.checks.filter(Boolean) : []
  const findings = Array.isArray(report.findings) ? report.findings.filter(Boolean) : []
  const summary = report?.summary ?? {}
  const byCheck = objectEntries(summary.byCheck)
  const byBucket = objectEntries(summary.byBucket)
  const byLocale = objectEntries(summary.byLocale)
  const bySeverity = objectEntries(summary.bySeverity)
  const findingsDetected = findings.length > 0
  const total = numberOrFallback(summary.total, findings.length)
  const errorCount = numberValue(summary?.bySeverity?.error)
  const warningCount = numberValue(summary?.bySeverity?.warning)

  lines.push('report_found=true')
  lines.push(`findings_detected=${findingsDetected}`)
  lines.push(`enabled_checks=${checks.length}`)
  for (const check of checks) {
    lines.push(`check_name=${check}`)
  }
  lines.push(`findings_total=${total}`)
  lines.push(`error_count=${errorCount}`)
  lines.push(`warning_count=${warningCount}`)
  lines.push(`findings_by_check=${byCheck.length}`)
  for (const [name, total] of byCheck) {
    lines.push(`by_check=${name}:${total}`)
  }
  lines.push(`findings_by_severity=${bySeverity.length}`)
  for (const [name, total] of bySeverity) {
    lines.push(`by_severity=${name}:${total}`)
  }
  lines.push(`findings_by_bucket=${byBucket.length}`)
  for (const [name, total] of byBucket) {
    lines.push(`by_bucket=${name}:${total}`)
  }
  lines.push(`findings_by_locale=${byLocale.length}`)
  for (const [name, total] of byLocale) {
    lines.push(`by_locale=${name}:${total}`)
  }

  setOutput('findings-detected', String(findingsDetected))
  setCountOutputs({ total, error: errorCount, warning: warningCount })
  emitAnnotations(findings, maxAnnotations, annotationsEnabled)
  writeSummary(summaryPath, lines)
  writeStepSummary(renderCheckMarkdown({
    configPath,
    reportPath,
    cliExitCode,
    checks,
    total,
    errorCount,
    warningCount,
    byCheck,
    byLocale,
    findings,
    maxAnnotations,
    annotationsEnabled,
  }))
}

function emitAnnotations(findings, maxAnnotations, enabled) {
  if (!enabled) {
    return
  }
  for (const finding of findings.slice(0, maxAnnotations)) {
    const level = finding?.severity === 'warning' ? 'warning' : 'error'
    const properties = []
    if (finding?.annotationFile) {
      properties.push(`file=${escapeProperty(String(finding.annotationFile))}`)
    }
    if (Number.isFinite(finding?.annotationLine) && finding.annotationLine > 0) {
      properties.push(`line=${finding.annotationLine}`)
      properties.push(`endLine=${finding.annotationLine}`)
    }
    properties.push(`title=${escapeProperty(`Hyperlocalise ${finding?.type ?? 'finding'}`)}`)
    const message = escapeData(formatFindingMessage(finding))
    process.stdout.write(`::${level} ${properties.join(',')}::${message}\n`)
  }
}

function formatFindingMessage(finding) {
  const parts = []
  if (finding?.message) {
    parts.push(String(finding.message))
  }
  const context = []
  if (finding?.bucket) {
    context.push(`bucket=${finding.bucket}`)
  }
  if (finding?.locale) {
    context.push(`locale=${finding.locale}`)
  }
  if (finding?.key) {
    context.push(`key=${finding.key}`)
  }
  if (context.length > 0) {
    parts.push(context.join(' '))
  }
  return parts.join(' | ')
}

function renderMissingReportMarkdown(checkName, configPath, reportPath, cliExitCode) {
  return [
    `## Hyperlocalise ${checkName}`,
    '',
    '- Report status: missing',
    `- Config path: \`${configPath}\``,
    `- CLI exit code: \`${cliExitCode}\``,
    `- Report path: \`${reportPath}\``,
    '',
    'The CLI did not produce a report. Check the workflow log for details.',
  ].join('\n')
}

function renderParseErrorMarkdown(checkName, configPath, reportPath, errorMessage) {
  return [
    `## Hyperlocalise ${checkName}`,
    '',
    '- Report status: parse failed',
    `- Config path: \`${configPath}\``,
    `- Report path: \`${reportPath}\``,
    '',
    `Parse error: \`${errorMessage}\``,
  ].join('\n')
}

function renderDriftMarkdown(details) {
  return [
    '## Hyperlocalise drift',
    '',
    `- Drift detected: ${details.driftDetected ? 'yes' : 'no'}`,
    `- Failures: ${details.failures}`,
    `- Warnings: ${details.warnings}`,
    `- Planned total: ${details.plannedTotal}`,
    `- Executable total: ${details.executableTotal}`,
    `- Skipped by lock: ${details.skippedByLock}`,
    `- Prune candidates: ${details.pruneCandidates}`,
    `- Config path: \`${details.configPath}\``,
    `- Report path: \`${details.reportPath}\``,
    `- CLI exit code: \`${details.cliExitCode}\``,
  ].join('\n')
}

function renderCheckMarkdown(details) {
  const lines = [
    '## Hyperlocalise check',
    '',
    `- Findings: ${details.total}`,
    `- Errors: ${details.errorCount}`,
    `- Warnings: ${details.warningCount}`,
    `- Config path: \`${details.configPath}\``,
    `- Report path: \`${details.reportPath}\``,
    `- CLI exit code: \`${details.cliExitCode}\``,
  ]
  if (details.checks.length > 0) {
    lines.push(`- Enabled checks: \`${details.checks.join(', ')}\``)
  }
  if (details.byCheck.length > 0) {
    lines.push('')
    lines.push('### By check')
    lines.push('')
    for (const [name, total] of details.byCheck) {
      lines.push(`- ${name}: ${total}`)
    }
  }
  if (details.byLocale.length > 0) {
    lines.push('')
    lines.push('### By locale')
    lines.push('')
    for (const [name, total] of details.byLocale) {
      lines.push(`- ${name}: ${total}`)
    }
  }
  if (!details.annotationsEnabled) {
    lines.push('')
    lines.push('GitHub annotations are disabled for this run.')
  } else if (details.findings.length > details.maxAnnotations) {
    lines.push('')
    lines.push(`GitHub annotations were limited to the first ${details.maxAnnotations} findings.`)
  }
  return lines.join('\n')
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)))
}

function objectEntries(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }
  return Object.entries(value).sort(([a], [b]) => String(a).localeCompare(String(b)))
}

function numberValue(value) {
  return Number.isFinite(value) ? value : 0
}

function numberOrFallback(value, fallback) {
  if (Number.isFinite(value)) {
    return String(value)
  }
  if (Number.isFinite(fallback)) {
    return String(fallback)
  }
  return 'unknown'
}

function writeSummary(filePath, contentLines) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${contentLines.join('\n')}\n`, 'utf8')
}

function writeStepSummary(markdown) {
  const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY
  if (!stepSummaryPath) {
    return
  }
  fs.appendFileSync(stepSummaryPath, `${markdown}\n`, 'utf8')
}

function setDefaultCountOutputs() {
  setOutput('findings-total', '0')
  setOutput('error-count', '0')
  setOutput('warning-count', '0')
}

function setCountOutputs(counts) {
  setOutput('findings-total', String(counts.total ?? 0))
  setOutput('error-count', String(counts.error ?? 0))
  setOutput('warning-count', String(counts.warning ?? 0))
}

function setOutput(name, value) {
  const githubOutput = process.env.GITHUB_OUTPUT
  if (!githubOutput) {
    return
  }
  fs.appendFileSync(githubOutput, `${name}=${value}\n`, 'utf8')
}

function escapeData(value) {
  return String(value)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
}

function escapeProperty(value) {
  return escapeData(value)
    .replace(/:/g, '%3A')
    .replace(/,/g, '%2C')
}
