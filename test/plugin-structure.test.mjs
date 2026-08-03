import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFile(join(root, path), "utf8");

test("Auto Pilot is explicit-only and exposes a valid skill path", async () => {
  const manifest = JSON.parse(await read(".codex-plugin/plugin.json"));
  const agent = await read("skills/auto-pilot/agents/openai.yaml");
  assert.equal(manifest.name, "codex-auto-pilot");
  assert.equal(manifest.skills, "./skills/");
  assert.match(agent, /allow_implicit_invocation:\s*false/);
});

test("five role templates preserve dynamic routing and receipt validation files exist", async () => {
  const templates = await readdir(join(root, "templates/agents"));
  assert.deepEqual(templates.sort(), [
    "auto-pilot-commander.toml", "auto-pilot-fixer.toml", "auto-pilot-goal-reviewer.toml",
    "auto-pilot-implementer.toml", "auto-pilot-release-reviewer.toml",
  ]);
  const skill = await read("skills/auto-pilot/SKILL.md");
  assert.match(skill, /Do not impose a skill-level writer cap/);
  assert.match(skill, /complete and approved/);
  assert.match(skill, /Do not invoke an upstream planning skill/);
  assert.match(skill, /effort=auto/);
  assert.match(skill, /strong Sol commander/);
  assert.match(skill, /gpt-5\.6-terra/);
  const contract = await read("skills/auto-pilot/references/execution-contract.md");
  assert.match(contract, /dynamic-ready-frontier/i);
  assert.match(contract, /There is no Auto Pilot writer cap/);
  assert.match(contract, /do not wait for the slowest worker or a fixed wave barrier/i);
  assert.match(contract, /one final review phase/i);
  await read("skills/auto-pilot/references/receipt-schema.md");
  await read("skills/auto-pilot/scripts/validate_receipt.py");
});
