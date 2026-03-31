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

const cliExitCode = Number.parseInt(cliExitCodeRaw, 10)
const reportExists = fs.existsSync(reportPath)
const lines = []

lines.push(`check=${checkName}`)
lines.push(`config_path=${configPath}`)
lines.push(`cli_exit_code=${Number.isNaN(cliExitCode) ? cliExitCodeRaw : cliExitCode}`)
lines.push(`report_path=${reportPath}`)

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

  writeSummary(summaryPath, lines)
  setOutput('drift-detected', String(driftDetected))
}

function writeCheckSummary(summaryPath, report, lines) {
  const checks = Array.isArray(report.checks) ? report.checks.filter(Boolean) : []
  const findings = Array.isArray(report.findings) ? report.findings : []
  const summary = report?.summary ?? {}
  const byCheck = objectEntries(summary.byCheck)
  const byBucket = objectEntries(summary.byBucket)
  const byLocale = objectEntries(summary.byLocale)
  const findingsDetected = findings.length > 0

  lines.push('report_found=true')
  lines.push(`findings_detected=${findingsDetected}`)
  lines.push(`enabled_checks=${checks.length}`)
  for (const check of checks) {
    lines.push(`check_name=${check}`)
  }
  lines.push(`findings_total=${numberOrFallback(summary.total, findings.length)}`)
  lines.push(`findings_by_check=${byCheck.length}`)
  for (const [name, total] of byCheck) {
    lines.push(`by_check=${name}:${total}`)
  }
  lines.push(`findings_by_bucket=${byBucket.length}`)
  for (const [name, total] of byBucket) {
    lines.push(`by_bucket=${name}:${total}`)
  }
  lines.push(`findings_by_locale=${byLocale.length}`)
  for (const [name, total] of byLocale) {
    lines.push(`by_locale=${name}:${total}`)
  }

  writeSummary(summaryPath, lines)
  setOutput('findings-detected', String(findingsDetected))
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

function setOutput(name, value) {
  const githubOutput = process.env.GITHUB_OUTPUT
  if (!githubOutput) {
    return
  }
  fs.appendFileSync(githubOutput, `${name}=${value}\n`, 'utf8')
}
