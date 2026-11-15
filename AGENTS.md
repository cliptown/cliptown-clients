# Agent instructions

## Repository-local Git worktrees

- Create or use a Git worktree only when the human operator explicitly authorizes it for the current task. Concurrency or a dirty checkout is not permission by itself.
- Put every authorized worktree at `<repository-root>/tmp/worktrees/<name>`; from the repository root, use `./tmp/worktrees/<name>`. Never place worktrees beside repositories or organization directories.
- Keep `tmp`, `temp`, `tmp/worktrees`, and `temp/worktrees` ignored in the repository-root `.gitignore`. Do not commit files from those directories.
- Relocate or remove a worktree only when the operator explicitly requests it. Before removal, preserve and publish intended changes, verify its commit is represented on the target branch, and confirm there are no tracked, untracked, ignored-sensitive, or in-use files that must survive. Remove it with `git worktree remove <path>` without `--force`; never delete a worktree directory with `rm`.

## Rust-first testing and scripting

- **Use Rust for all new tests and first-party scripts. Do not add Python scripts, Python test harnesses, Python heredocs, or Python-based CI automation.** Prefer local `cargo test` suites or a reviewable `cargo xtask`.
- Require Rust format, Clippy, and positive/negative test evidence on the exact proposed GitHub head. Never weaken security or contract checks when switching languages.
- Existing Python validators are migration debt, not authorization for new Python tooling. Keep existing required gates enabled until a Rust implementation passes equivalent regression, schema, source-receipt, safety and cross-platform tests.
- For AttoLang `.atto` support, source-contract checks do not prove executable compiler/runtime transport parity.
- This repository-local policy implements the [ClipTown Rust-first rule](https://github.com/cliptown/.github/pull/22); org `.github` agent rules are not automatically inherited.
