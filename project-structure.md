# Project Structure Organization Instructions

The frontend code needs to be organized like this:


# Project structure guidance & LLM reorganization instructions

This document defines the desired frontend project layout and—critically—a robust, self-contained prompt and rule-set an LLM-driven coding agent can use to reorganize the repository automatically without breaking existing functionality.

Keep these high-level constraints at all times:
- Preserve functionality: do not change behavior of running code. Any change must be minimal and reversible.
- No new dependencies: do not add or remove package dependencies (npm, pip, etc.).
- No global refactors: avoid widespread renames or API changes. Prefer local edits to fix imports and keep files working.
- Preserve secrets and environment files: never commit or expose credentials.
- Use git: create a feature branch, make small commits with clear messages, and include a single final PR/merge commit.

Desired frontend layout (canonical):

```
src/
├─ app/                # application-level bootstrap & routes (app.tsx, provider.tsx, router.tsx)
├─ assets/             # static assets (images, fonts)
├─ components/         # shared UI components across the app
├─ config/             # app-wide configuration and env wiring
├─ features/           # feature-based folders (preferred place for new code)
├─ hooks/              # shared React hooks
├─ lib/                # small reusable libraries
├─ stores/             # global state stores (Redux/Mobx/Context)
├─ testing/            # test utilities, mocks, fixtures
├─ types/              # shared TypeScript types (or JS typedefs)
└─ utils/              # utilities and helpers
```

Notes:
- Do not create this structure blindly; move files only when safe (update imports and verify builds/tests).
- Barrel files are allowed but avoid creating new ones that could hurt tree-shaking for Vite. Prefer explicit imports when in doubt.
- Prefer unidirectional dependency flow: shared modules -> features -> app.

Feature layout example (only add folders that are needed):

```
src/features/<feature-name>/
├─ api/        # feature-specific API wrappers/hooks
├─ components/ # components local to the feature
├─ hooks/      # feature-scoped hooks
├─ stores/     # local state for the feature
└─ utils/      # small utilities used only by the feature
```

LLM reorganization acceptance criteria (must be satisfied before merging):
1. The frontend app builds successfully (run `cd frontend && npm run build` or `npm run build` at repo root if applicable).
2. Frontend dev server starts (if present): `cd frontend && npm start` and no immediate runtime errors in console on load.
3. Existing test suites pass (if present): `npm test` for frontend and any backend tests (run both where applicable).
4. No new dependencies were added or removed from package manifests.
5. All changed files have updated, correct imports and no TypeScript/ESLint syntax errors.
6. A migration report is produced listing files moved, imports updated, and any assumptions made.

Checklist the agent should follow while reorganizing:
- Inspect the repo to find the current frontend entry points (common locations: `frontend/src`, `src/`, `frontend/`).
- Create the minimal canonical folders under `frontend/src/` (or repo's existing frontend source root) without deleting the old files immediately.
- Move files one small group at a time (for example, move `components/*` then run build/tests). Update imports to new relative paths.
- After each logical move, run the build and tests. If something fails, attempt an automated fix (update imports/exports). If still failing, revert that move and continue with other safe moves.
- Document all assumptions and any manual decisions in the migration report.

Rollback & safety:
- Work on a new branch named `reorg/llm-auto-<timestamp>`.
- Make small commits and push branch frequently.
- If a move breaks the build and cannot be fixed automatically within 2 attempts, revert that commit and leave a clear TODO in the migration report.

Tests to add (minimum):
- A smoke test that imports the main frontend entry (e.g., `import App from '...';`) and verifies it renders without throwing (Jest + react-testing-library or simple Node import tests).
- A bundling check: run the production build and assert exit code 0.

Developer expectations / constraints for LLM agent:
- Do not change backend routes, API behavior, or runtime secrets.
- Do not stop long-running screen sessions or processes (per project instructions).
- If the repo uses nonstandard build tooling, detect and follow those scripts defined in top-level or `frontend/package.json`.
- When uncertain about where a file should move, pick a conservative option (leave file in place) and record the decision.

What to produce at the end of an automated run:
- A branch with commits performing the reorganization.
- A migration report file at `REORG_REPORT.md` listing all moves, changed imports, tests run and results, and any remaining manual steps.
- A final checklist showing acceptance criteria status.

----

## RESILIENCE & CONTINUATION RULES (MANDATORY)

When running an unattended LLM-driven reorganization, the agent must implement robust checkpointing, retry, and resume behavior so work is not lost and can be continued if interrupted.

1) Session files (repo root):
- `REORG_REPORT.md` — human-readable progress report appended after each logical step.
- `REORG_SESSION.json` — machine-readable checkpoint describing steps, last commit SHA, status, errors, and next actions.

2) `REORG_SESSION.json` schema (minimum fields):
```
{
  "branch": "reorg/llm-auto-<timestamp>",
  "last_commit": "<sha>",
  "status": "in-progress|paused|complete|failed",
  "steps": [
    { "id": 1, "desc": "create folders", "status": "done", "commit": "<sha>", "ts": "<ISO8601>" },
    { "id": 2, "desc": "move components batch 1", "status": "paused", "commit": "<sha>", "error": "build failed: missing import './X'", "attempts": 2, "next_actions": ["fix import './X' -> '../components/X'"] }
  ],
  "next_step": "move components batch 1 - fix import './X'"
}
```

3) Commit strategy:
- Commit after every successful logical step and update `REORG_SESSION.json` with the commit SHA and step status.
- Push if remote write is permitted; if not, record the local commit SHA in the session file.

4) Auto-retry & revert policy:
- For failing build/test checks, attempt up to MAX_AUTO_FIX_ATTEMPTS (default 2) automated fixes (repair import paths, small export changes).
- If still failing, revert that commit, mark the batch `paused` in `REORG_SESSION.json`, record diagnostics and `next_actions`, then continue with other safe batches.

5) Resume behavior:
- On start, read `REORG_SESSION.json`. Resume from the first `in-progress` or `paused` step. Do not repeat steps marked `done`.
- For `paused` steps, re-attempt automated fixes up to the attempt limit, then revert if still failing and continue.

6) Token/session limits:
- If the agent must stop because of token or time limits, finish the current atomic step, commit, update `REORG_SESSION.json`, write a concise `next_step` in `REORG_REPORT.md`, and exit with `status: in-progress`.

7) Backups before destructive actions:
- Before mass deletions/renames, create a Git bundle or tag (e.g., `git bundle create pre-reorg-<TIMESTAMP>.bundle HEAD`) and record its path in `REORG_SESSION.json`.

8) Environment limitations:
- If builds/tests cannot be run (missing toolchain, network restrictions), mark `status: paused` with exact error logs and the single human action required to proceed, but continue safe static moves (file relocation, import updates).

----

## CONSOLIDATED LLM PROMPT (copy-and-paste verbatim)

Use the prompt below when invoking an LLM coding agent. Replace bracketed placeholders where specified (e.g., `<TIMESTAMP>`, `<BRANCH_PREFIX>`). The prompt includes the canonical reorg rules plus the mandatory resilience/checkpointing behavior so the agent can continue or be resumed.

--- COPY-PASTE PROMPT START ---
You are an automated, trusted coding agent with full repository access. Read `project-structure.md` at the repository root and follow it exactly. Your job: reorganize the frontend source into the canonical layout defined in this file while preserving functionality, avoiding dependency changes, and producing a detailed migration report. Operate unattended and implement checkpointing and resume behavior as specified below.

PARAMETERS (replace as needed):
- SOURCE_ROOT (optional): front-end source root to use (e.g., `frontend/src`). If omitted, auto-detect by checking `frontend/src`, `src`, `frontend`, then package.json scripts.
- BRANCH_PREFIX (default): `reorg/llm-auto`
- TIMESTAMP (required): ISO-like timestamp for branch name, e.g., `20251007T123000`
- MAX_AUTO_FIX_ATTEMPTS (default): 2
- DRY_RUN (optional): if true, do not modify files or git; produce `REORG_REPORT.md` skeleton only.

PRECONDITIONS:
1. Abort if working tree has uncommitted changes. Print a one-line reason if aborting.
2. Create a branch: `git checkout -b <BRANCH_PREFIX>-<TIMESTAMP>`.

MAIN WORKFLOW (strict order):
1. Detect `SOURCE_ROOT` (or auto-detect). Use that as the frontend source root.
2. Create minimal canonical folders under the source root: `app/`, `assets/`, `components/`, `config/`, `features/`, `hooks/`, `lib/`, `stores/`, `testing/`, `types/`, `utils/` — create only the folders you will use.
3. Move files conservatively in small batches (shared UI -> `components/`, feature-local -> `features/<name>/`, assets -> `assets/`, config -> `config/`). After each batch:
   a. Update imports/exports and asset paths.
   b. Run build/tests.
   c. If build/tests pass, commit and continue.
   d. If build/tests fail, attempt up to `MAX_AUTO_FIX_ATTEMPTS` automated fixes (import path corrections, small export changes). If still failing, revert that batch commit, mark the batch `paused` in `REORG_SESSION.json` with diagnostics and `next_actions`, and continue with other batches.
4. Add a minimal smoke test in `testing/` that imports the app entry and asserts it loads without throwing. Commit and run tests.
5. After all safe moves, run a full production build and complete test suite. Fix remaining issues with the same retry/revert policy.
6. Produce `REORG_REPORT.md` with branch name, commit list, files moved (old -> new), imports/exports updated, commands run and outputs, paused/reverted moves and reasons, assumptions, and next steps.

RESILIENCE & CHECKPOINTING (MANDATORY):
- Maintain `REORG_REPORT.md` (human) and `REORG_SESSION.json` (machine) and update them after each atomic step.
- `REORG_SESSION.json` must track branch, last_commit SHA, step list with statuses, `next_step`, and timestamps.
- Commit-and-push after each successful logical step (or commit locally and record SHA if push not allowed).
- Auto-retry up to `MAX_AUTO_FIX_ATTEMPTS` per failing area. If still failing, revert and mark `paused`.
- On restart, read `REORG_SESSION.json` and resume from the first non-`done` step.
- If interrupted due to token/session limits, finish the current atomic step, commit, update session files, write a concise `next_step` into `REORG_REPORT.md`, and exit with `status: in-progress`.

COMMANDS (preferred; detect actual scripts if different):
- Build: `cd frontend && npm run build` (or `npm run build` in source root)
- Test: `cd frontend && npm test` (or `npm test` in source root)

AUTOMATED FIX EXAMPLES (allowed, minimal):
- Fix broken relative import paths.
- Convert default->named export only when safe and minimal.
- Update asset import paths after moving assets.

PROHIBITIONS (do not do):
- Do not add/remove/modify package dependencies in `package.json` or `requirements.txt`.
- Do not change environment files or commit secrets.
- Do not perform global renames or API-level refactors.
- Do not stop/restart screen-managed long-running processes.

ACCEPTANCE CRITERIA (must be satisfied before marking `status: complete`):
- Production build exits 0.
- Tests (existing + new smoke test) run without fatal errors.
- No dependency changes in package manifests.
- `REORG_REPORT.md` present and complete.
- `REORG_SESSION.json` shows `status: complete` and final commit SHA.

FINAL DELIVERABLES:
- A git branch `<BRANCH_PREFIX>-<TIMESTAMP>` with small descriptive commits.
- `REORG_REPORT.md` and `REORG_SESSION.json` at repo root.
- A concise summary message listing commands run and their outputs.

If `DRY_RUN=true`, do not perform edits or git ops; produce `REORG_REPORT.md` skeleton listing candidate files and suggested moves and exit with `status: paused`.

IF YOU CANNOT RUN BUILDS/TESTS: continue safe static moves, update imports, record everything in the session file, and mark `status: paused` with precise human action required to resume.

Start now and document every decision in `REORG_REPORT.md`.

--- COPY-PASTE PROMPT END ---

----

I have appended the resilience rules and the consolidated, copy-pasteable prompt to this file. Use the prompt as the authoritative instruction for any LLM-driven reorganization. If you want, I can now run a dry-run analysis and create a candidate `REORG_REPORT.md` skeleton (no repo changes). Reply "Do the dry run" to start.
