---
name: skills-discovery-runtime
description: >
  Debug skill scanner for Grok Build: project skills/, user ~/.grok/skills,
  ~/.agents/skills, bundled. Use for Settings Skills empty, skill not listed,
  skills.cjs, listSkills.
---

# skills-discovery-runtime

## Code map

| Piece | Path |
|-------|------|
| Scanner | `electron/skills.cjs` |
| IPC | `skills:list` |
| Preload | `listSkills` |
| UI | Settings → Skills |

## Roots (order / sources)

| Source | Path |
|--------|------|
| user | `~\.grok\skills\<name>\SKILL.md` |
| agents | `~\.agents\skills\<name>\SKILL.md` |
| bundled | `~\.grok\bundled\skills\…` |
| project | `<cwd>/skills/`, `<cwd>/.agents/skills/`, `<cwd>/.grok/skills/` |

Requirement: **directory** containing `SKILL.md`. Frontmatter `name` + `description` preferred.

## Not scanned

- `~\.codex\plugins\cache\…` (Codex only)
- Random markdown without folder+SKILL.md

## Debug checklist

| Symptom | Check |
|---------|--------|
| Project skills missing | folder under `skills/<name>/SKILL.md`; project opened as cwd |
| Empty list | roots existence; permissions; parse throw |
| Duplicate names | multiple roots — UI shows source labels |
| Description blank | frontmatter / first body paragraph |
| Agent ignores skill | discovery OK but model not loading file — CLI/agent side |

## Rules

- Public playbooks → repo `skills/` (pushable).
- Personal harness → `.agents/` (gitignored) — **push-source-safe**.
- Adding skill = disk folder; no separate registry DB.

## Verify

- `skills:list` with projectPath = repo root includes `yeet-grok`, etc.
- After new folder, refresh Skills UI shows it.
