# Repository structure and agent setup

How **users**, **Cursor**, **Claude** (and other agents), and markdown rule files work together, and how to use a single work-tree setup for all agents.

---

## Current layout

### Rule and agent entry points


| File / folder              | Who uses it                               | Purpose                                                                                           |
| -------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **AGENTS.md** (repo root)  | Cursor, Claude (and other agents), humans | Single entry point: points to `.cursor/rules/` and tells agents where project rules live.         |
| **.cursor/rules/*.mdc**    | Cursor                                    | Project rules with frontmatter (`alwaysApply`, `globs`). Cursor injects these into agent context. |
| **.cursor/worktrees.json** | Cursor                                    | Worktree setup: commands run when Cursor creates a new agent worktree (e.g. `npm ci`).            |


### Cursor rules (`.cursor/rules/`)

- **architecture.mdc** — Always applied. Core contracts, invariants, data locations, stubs.
- **workflow.mdc** — Always applied. Commands (cwd: repo root), testing, commits, when to update rules.
- **unit-standards.mdc** — Applied for `src/**/*.ts`. Energy/power/price units and naming.

### Other markdown

- **README.md** — Project overview, philosophy, key code locations, commands, notes for agents.
- **UNIT_STANDARDS.md** — Long-form unit doc; engine detail. Rule `unit-standards.mdc` is the canonical contract for agents.
- **TODO.md** — Product/engine/data backlog.
- **SOLAR_DATA_FORMAT.md** — Referenced from architecture; solar CSV format.
- **docs/** — Design/feature docs (e.g. shareable reports, CSV optimization).

---

## How the systems differ

### Cursor

- Opens the repo as the workspace; agents (e.g. Claude) run in that workspace or in **git worktrees**.
- Reads **AGENTS.md** and **.cursor/rules/*.mdc** from the project.
- For parallel / worktree agents, Cursor creates a worktree per agent and runs the **worktree setup** from `.cursor/worktrees.json` in that worktree (e.g. install deps so each worktree is ready to build/test).

### Claude and other agents (outside Cursor)

- When Claude or another agent runs in a different environment (e.g. another IDE or API), it can still use this repo as the workspace.
- **AGENTS.md** and the same rule files in `.cursor/rules/` describe the project; follow the same setup step (run `npm ci` or `npm install` in the repo root) so the tree is ready to build and test.

### Users (humans)

- **AGENTS.md** and **README.md** explain where rules and commands live.
- **docs/AGENT_AND_WORKTREE_SETUP.md** (this file) explains how agents and work trees are configured.

---

## Single work-tree setup (shared by Cursor and all agents)

Goal: **one way to “prepare the tree”** so that:

1. **Cursor** worktrees and main tree use the same setup (install deps, same cwd).
2. **Claude or other agents** (when this repo is the workspace) run the same steps.
3. **All agents** are encouraged to use work trees when available.

### What we use

- **.cursor/worktrees.json** — Cursor runs this when creating a worktree. It runs `npm ci` so each worktree has dependencies and is ready for `npm run test:run` / `npm run build`.
- **AGENTS.md** — States that agents should prefer work trees when available; lists the same rule locations and “run `npm install` (or `npm ci`) in the workspace” so any agent or human knows the setup step.

So “work tree” means:

- **Cursor**: a git worktree created by Cursor, with setup from `worktrees.json`.
- **Other agents (e.g. Claude)**: the repo (or a worktree of it) used as the workspace, with deps installed per AGENTS.md.

No symlinks into the main tree: each worktree/workspace gets its own `node_modules` (Cursor docs recommend against symlinking deps).

---

## Encouraging work trees by default

- **Cursor**: Worktree usage is a Cursor feature (parallel agents / worktree runs). We can’t force “always worktree” from the repo; we document it in AGENTS.md and provide **worktrees.json** so that when worktrees are used, they’re set up consistently.
- **Claude and other agents**: Using this repo (or a worktree) as the workspace and running `npm ci` / `npm install` there is the intended setup.
- **AGENTS.md** tells every agent: prefer work trees when available, and use the same setup (install deps in the tree you’re working in).

---

## Summary

- **One entry point**: **AGENTS.md** → points to `.cursor/rules/` and to this doc.
- **One setup step**: install deps in the current tree (`npm ci` in Cursor worktrees via worktrees.json; `npm install` or `npm ci` in the workspace per AGENTS.md).
- **Same rules**: Cursor reads `.cursor/rules/*.mdc`; Claude and other agents (and humans) can follow AGENTS.md and the same rule files.
- **Encourage work trees**: AGENTS.md instructs agents to use work trees when available; Cursor gets a proper worktree setup from `.cursor/worktrees.json`.

