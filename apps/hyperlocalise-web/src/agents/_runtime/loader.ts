import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { parseFrontmatter, type ParsedMarkdownDocument } from "./parse-frontmatter";
import { getAgentPackageRoot, getAgentsRoot, getAutomationAgentRoot } from "./paths";

export type AgentPackageRef =
  | { agentId: string; automationId?: never }
  | { automationId: string; agentId?: never };

export type AgentSkillDocument = ParsedMarkdownDocument & {
  id: string;
};

export type AgentManifest = {
  id: string;
  kind: "agent" | "automation";
  instructions: string;
  skills: Record<string, AgentSkillDocument>;
};

function readTextFile(path: string): string {
  if (!existsSync(path)) {
    return "";
  }

  return readFileSync(path, "utf8");
}

function resolveAgentDir(ref: AgentPackageRef): {
  dir: string;
  id: string;
  kind: AgentManifest["kind"];
} {
  if ("automationId" in ref && ref.automationId) {
    return {
      dir: getAutomationAgentRoot(ref.automationId),
      id: ref.automationId,
      kind: "automation",
    };
  }

  return {
    dir: getAgentPackageRoot(ref.agentId!),
    id: ref.agentId!,
    kind: "agent",
  };
}

function loadSkillsFromDir(skillsDir: string): Record<string, AgentSkillDocument> {
  if (!existsSync(skillsDir)) {
    return {};
  }

  const skills: Record<string, AgentSkillDocument> = {};

  for (const filename of readdirSync(skillsDir)) {
    if (!filename.endsWith(".md")) {
      continue;
    }

    const raw = readTextFile(join(skillsDir, filename));
    const parsed = parseFrontmatter(raw);
    const id = parsed.frontmatter.id || filename.replace(/\.md$/, "");
    skills[id] = { ...parsed, id };
  }

  return skills;
}

export function loadAgentManifest(ref: AgentPackageRef): AgentManifest {
  const { dir, id, kind } = resolveAgentDir(ref);
  return {
    id,
    kind,
    instructions: readTextFile(join(dir, "instructions.md")),
    skills: loadSkillsFromDir(join(dir, "skills")),
  };
}

export function loadAgentInstructions(ref: AgentPackageRef): string {
  return loadAgentManifest(ref).instructions;
}

export function loadAgentSkill(ref: AgentPackageRef & { skillId: string }): string {
  const manifest = loadAgentManifest(ref);
  const skill = manifest.skills[ref.skillId];
  return skill ? skill.body.trim() : "";
}

export function loadSharedSkill(skillId: string): string {
  const path = join(getAgentsRoot(), "_runtime", "shared-skills", `${skillId}.md`);
  const raw = readTextFile(path);
  return parseFrontmatter(raw).body.trim();
}

export function loadSubagentInstructions(input: { agentId: string; subagentId: string }): string {
  const path = join(
    getAgentPackageRoot(input.agentId),
    "subagents",
    input.subagentId,
    "instructions.md",
  );
  return readTextFile(path).trim();
}

export function listAgentSkills(ref: AgentPackageRef): AgentSkillDocument[] {
  return Object.values(loadAgentManifest(ref).skills);
}

const manifestCache = new Map<string, AgentManifest>();

export function getAgentManifest(ref: AgentPackageRef): AgentManifest {
  const key =
    "automationId" in ref && ref.automationId
      ? `automation:${ref.automationId}`
      : `agent:${ref.agentId}`;
  const cached = manifestCache.get(key);
  if (cached) {
    return cached;
  }

  const manifest = loadAgentManifest(ref);
  manifestCache.set(key, manifest);
  return manifest;
}

export function clearAgentManifestCache() {
  manifestCache.clear();
}
