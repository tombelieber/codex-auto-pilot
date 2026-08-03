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

test("four role templates preserve routing and receipt validation files exist", async () => {
  const templates = await readdir(join(root, "templates/agents"));
  assert.deepEqual(templates.sort(), [
    "auto-pilot-fixer.toml", "auto-pilot-goal-reviewer.toml",
    "auto-pilot-implementer.toml", "auto-pilot-release-reviewer.toml",
  ]);
  const skill = await read("skills/auto-pilot/SKILL.md");
  assert.match(skill, /at most five writers/);
  assert.match(skill, /gpt-5\.6-terra/);
  assert.match(skill, /gpt-5\.6-sol/);
  assert.match(skill, /plugin installation alone does not activate/);
  await read("skills/auto-pilot/references/execution-contract.md");
  await read("skills/auto-pilot/references/receipt-schema.md");
  await read("skills/auto-pilot/scripts/validate_receipt.py");
});
