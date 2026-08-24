# M1 Workspace Baseline Audit (task-m1-01)

**Audit date**: 2026-08-23
**Mode**: read-only — no file was created, modified, or deleted by this audit except this document
**Owner**: task-m1-01, `docs/research/workspace-baseline.md` only
**Purpose**: Record the pre-scaffold state of the workspace and native toolchain before any M1/M2 install, scaffold, or build occurs, per `.agents/results/plan-20260822-230328.json`.

All commands below were run from the repository root (`$REPO_ROOT`) unless noted. Home-directory paths are shown as `$HOME` where the literal value adds no diagnostic value; Nix store paths and simulator UUIDs are recorded as-is since they contain no personal data.

---

## 1. Working directory

| Command | Output |
|---|---|
| `pwd` | `$REPO_ROOT` |
| `git rev-parse --show-toplevel` | `$REPO_ROOT` (matches `pwd` — no nested-repo surprise) |

## 2. Architecture / macOS

| Command | Output |
|---|---|
| `uname -a` | `Darwin fenrir 25.5.0 Darwin Kernel Version 25.5.0: Tue Jun 9 22:18:58 PDT 2026; root:xnu-12377.121.10~1/RELEASE_ARM64_T6000 arm64` |
| `uname -m` | `arm64` |
| `sw_vers` | `ProductName: macOS` / `ProductVersion: 26.5.2` / `BuildVersion: 25F84` |

**Interpretation**: Host is Apple Silicon (`arm64`) running macOS 26.5.2. This matches the plan's assumption that `aarch64-darwin` is the only host architecture in scope for M1.

## 3. Git branch, status, HEAD

| Command | Output |
|---|---|
| `git branch --show-current` | `main` |
| `git status` | `On branch main` / `Your branch is ahead of 'origin/main' by 2 commits.` / two unstaged modifications observed by the task (below) |
| `git status --porcelain` | ` M .agents/oma-config.yaml` / ` M .serena/project.yml` |
| `git rev-parse HEAD` | `508130bea069ec44ae6713961aadfb9805b78fc4` |
| `git log -1 --format='%H %ad %s' --date=iso` | `508130bea069ec44ae6713961aadfb9805b78fc4 2026-08-22 23:22:45 +0900 fix: pm agent model to gpt-5.6-sol xhigh` |
| `git log --oneline -5` | `508130b fix: pm agent model to gpt-5.6-sol xhigh` / `eab4ba7 docs(roadmap): define offline-first chat milestones` / `e054703 init: oh-my-agent` |
| `git remote -v` | `origin git@github.com:jamye-plz/jamye-app.git (fetch, push)` |

**Interpretation — dirty file ownership**:

- `.agents/oma-config.yaml` is a pre-existing, explicitly user-owned change. The user instructed
  the workflow to keep the changed configuration and continue without reverting it.
- `.serena/project.yml` was not present in the coordinator's immediately pre-task dirty-file
  list. It appeared during orchestration/bootstrap, before this audit document was written, and
  its diff is Serena 1.7.0's automatic compatibility update: both `languages` and
  `language_servers` are present with the same values, and missing defaults/comments were
  materialized. It is not attributed to the user as an authored edit. On 2026-08-23 the user
  explicitly approved retaining this automatic update.

This audit did not stage, revert, or resolve either file.

```
$ git diff --stat
 .agents/oma-config.yaml |   7 ++-
 .serena/project.yml     | 162 ++++++++++++++++++++++++++++++++++++++++++++++--
 2 files changed, 160 insertions(+), 9 deletions(-)
```

No Git write command (`add`, `commit`, `checkout`, `restore`, `stash`, `push`, etc.) was run during this audit — only `status`, `branch --show-current`, `rev-parse`, `log`, `remote -v`, and `diff --stat`.

## 4. Root directory contents

`find . -maxdepth 1` (repository root):

```
.
./.agents
./.claude
./.codex
./.git
./.gitignore
./.mcp.json
./.serena
./AGENTS.md
./CLAUDE.md
./docs
```

**Interpretation**: Only harness/config directories (`.agents`, `.claude`, `.codex`, `.serena`), VCS metadata (`.git`, `.gitignore`), MCP config (`.mcp.json`), agent instruction files (`AGENTS.md`, `CLAUDE.md`), and `docs/` exist at root. No application scaffold exists yet.

`docs/` tree (`find docs -maxdepth 3`):

```
docs
docs/plans
docs/plans/work
docs/plans/work/001-jamye-app-greenfield.md
docs/roadmap.md
```

`docs/research/` did not exist prior to this audit; it was created solely to hold this document (`docs/research/workspace-baseline.md`), per this task's `file_ownership` grant.

## 5. Project package / lock / flake files — presence check

Checked by literal path existence at repository root; every entry below was **absent** unless marked otherwise:

| File | Status |
|---|---|
| `package.json` | absent |
| `package-lock.json` | absent |
| `bun.lock` | absent |
| `bun.lockb` | absent |
| `yarn.lock` | absent |
| `pnpm-lock.yaml` | absent |
| `flake.nix` | absent |
| `flake.lock` | absent |
| `.envrc` | absent |
| `Gemfile` / `Gemfile.lock` | absent |
| `Podfile` / `Podfile.lock` | absent |
| `app.json` / `app.config.js` / `app.config.ts` | absent |
| `tsconfig.json` | absent |
| `.nvmrc` / `.node-version` / `.tool-versions` / `mise.toml` | absent |
| `app/`, `ios/`, `android/`, `src/` directories | absent |

**Interpretation**: No project scaffold, no package manager lockfile, and no Nix flake exist anywhere in the repository yet. This confirms the plan's assumption that "no application code, database schema, or contract exists yet in this repository." `flake.nix`/`flake.lock` authorship is explicitly out of scope for this task (owned by task-m1-05/task-m1-07).

## 6. Nix

| Command | Output |
|---|---|
| `command -v nix` | `/run/current-system/sw/bin/nix` |
| `nix --version` | `nix (Nix) 2.35.2` |
| `ls -la /nix` (top level) | `.Trashes`, `store`, `var` present |

**Interpretation**: Nix is installed system-wide (`/run/current-system/sw/bin/nix`, a NixOS-style/Determinate-style layout on macOS) and the Nix store exists at `/nix/store`. No `flake.nix` exists in this repository yet (§5), so this is the global Nix installation only — no project devShell has been entered, and none was entered by this audit.

## 7. Bun / Node

| Command | Output |
|---|---|
| `command -v bun` | `/etc/profiles/per-user/poby/bin/bun` |
| `bun --version` | `1.3.13` |
| `command -v node` | `/etc/profiles/per-user/poby/bin/node` |
| `node --version` | `v24.19.0` |
| `command -v npm` | `/etc/profiles/per-user/poby/bin/npm` |
| `npm --version` | `11.17.0` |

**Interpretation**: Bun and Node are already resolvable on `PATH`, but via the user's **per-user Nix profile** (`/etc/profiles/per-user/poby/bin/...`), not via a project-scoped `nix develop` shell — no `flake.nix` exists yet (§5/§6) to produce one. These versions are pre-existing environment state, not something this plan's task set installed, and are **not** to be assumed as the versions M1's flake will ultimately pin (that pinning decision belongs to task-m1-02/task-m1-04).

## 8. Xcode / Simulator

| Command | Output |
|---|---|
| `xcode-select -p` | `/Applications/Xcode.app/Contents/Developer` |
| `xcodebuild -version` | `Xcode 26.6` / `Build version 17F113` |
| `xcrun simctl list devices` (iOS 26.5 runtime, truncated) | 11 simulator device entries present, all `(Shutdown)`, e.g. `iPhone 17 Pro`, `iPhone 17 Pro Max`, `iPhone Air`, `iPad Pro 13-inch (M5)`, etc. (full UUID list captured in raw command output, omitted here as non-actionable detail) |

**Interpretation**: Xcode 26.6 (build 17F113) is already installed and selected via `xcode-select`, with an iOS 26.5 simulator runtime and at least 11 device types available (none currently booted). This satisfies the presence half of `gate-xcode-android-studio-install`'s expected output for iOS; no installation or simulator boot was performed by this audit.

## 9. Java / JAVA_HOME

| Command | Output |
|---|---|
| `java -version` | `openjdk version "25.0.3" 2026-04-21 LTS` / `OpenJDK Runtime Environment Zulu25.34+17-CA (build 25.0.3+9-LTS)` / `OpenJDK 64-Bit Server VM Zulu25.34+17-CA (build 25.0.3+9-LTS, mixed mode, sharing)` |
| `echo $JAVA_HOME` | `/nix/store/agzrdk3jci8zp51j7mys0jnivwxia8rr-zulu-ca-jdk-25.0.3` |
| `command -v java` | `/etc/profiles/per-user/poby/bin/java` |

**Interpretation**: A JDK (Zulu build of OpenJDK 25.0.3) is already present and `JAVA_HOME` is already set, sourced from the Nix store via the per-user profile — same caveat as §7: this is pre-existing global environment state, not a project-scoped pin, and is not to be treated as M1's approved JDK version without going through task-m1-02/task-m1-04.

## 10. Android Studio / SDK / env / adb / sdkmanager / emulator

| Command | Output |
|---|---|
| `echo $ANDROID_HOME` | unset |
| `echo $ANDROID_SDK_ROOT` | unset |
| `ls -d "/Applications/Android Studio.app"` | not found — `Android Studio.app` is **not installed** in `/Applications` |
| `command -v adb` | not found |
| `command -v sdkmanager` | not found |
| `command -v emulator` | not found |
| `$HOME/Library/Android/sdk` | absent |
| `$HOME/Android/Sdk` | absent |

**Interpretation**: No Android tooling is present at all — no Android Studio application, no SDK directory in either conventional location, no `ANDROID_HOME`/`ANDROID_SDK_ROOT` env vars, and none of `adb`/`sdkmanager`/`emulator` are on `PATH`. This is a full-absence state; nothing was installed or downloaded by this audit. Per the plan, Android SDK provisioning is Nix-managed and deferred to task-m1-05 (flake authorship) and the user-run gates in task-m1-07/task-m1-08 — this task only records that the pre-scaffold state is empty.

## 11. CocoaPods / Watchman / Maestro

| Command | Output |
|---|---|
| `command -v pod` | not found |
| `pod --version` | n/a (not found) |
| `command -v watchman` | not found |
| `watchman --version` | n/a (not found) |
| `command -v maestro` | not found |
| `maestro --version` | n/a (not found) |
| `gem list -i cocoapods` | `false` (not installed via system gem either) |

**Interpretation**: CocoaPods, Watchman, and Maestro are all absent from the current environment. Per the plan's exclusions, Watchman and Maestro are explicitly deferred past M1 (no installation is expected or attempted here). CocoaPods presence/absence is recorded for completeness per this task's `commands_used`; its provisioning (if any) is scoped to a later mobile task, not this audit.

---

## Summary table

| Toolchain | State |
|---|---|
| Host | macOS 26.5.2, arm64 (Apple Silicon), `aarch64-darwin` |
| Git | `main`, HEAD `508130b`, 2 commits ahead of `origin/main`; one explicit user-owned config change plus one user-approved Serena 1.7.0 schema migration; no project scaffold committed |
| Project package/lock/flake files | None present (no `package.json`, no lockfile, no `flake.nix`/`flake.lock`) |
| Nix | Installed (2.35.2), global/system profile only — no project devShell yet |
| Bun | 1.3.13, via per-user Nix profile (pre-existing, not yet M1-pinned) |
| Node | v24.19.0, via per-user Nix profile (pre-existing, not yet M1-pinned) |
| Xcode | 26.6 (build 17F113), `xcode-select` configured, iOS 26.5 simulators available |
| Java | OpenJDK 25.0.3 (Zulu), `JAVA_HOME` set via Nix store path (pre-existing, not yet M1-pinned) |
| Android Studio / SDK | Fully absent — no app, no SDK dir, no env vars, no CLI tools on `PATH` |
| CocoaPods | Absent |
| Watchman | Absent (out of scope for M1) |
| Maestro | Absent (out of scope for M1) |

## Audit execution blockers

None. The read-only audit itself encountered no access failure. M1 environment completion still
depends on the later user-owned Android Studio, Android SDK/AVD, flake lock, and devShell command
gates; their absence is an observed prerequisite, not a failure of this audit.

## Confirmation

- No installation, scaffold, or build command was run during this audit.
- No `nix flake lock`, `nix build`, or other Nix-store-mutating command was run.
- No Git write command (`add`, `commit`, `checkout`, `restore`, `stash`, `push`) was run.
- No file other than `docs/research/workspace-baseline.md` (and this task's own progress/result memory artifacts under `.agents/state/memories/`) was created or modified.
- `.agents/oma-config.yaml` and the later user-approved `.serena/project.yml` schema migration
  were left unstaged and unreverted by this audit.
