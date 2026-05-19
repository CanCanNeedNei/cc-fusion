# 发布 npm patch 版本

## Goal

将已验证的 statusline tasks 分波重置修复发布到 npm，确保 GitHub main、release tag、GitHub Actions npm publish workflow、npm registry 和 GitHub Release 状态一致。

## What I already know

* 用户明确要求：push 并发布 npm。
* 当前 branch 是 `main`，tracking `origin/main`，本地领先 4 个 commit。
* 当前 remote 是 `Apparux/cc-fusion`，GitHub default branch 是 `main`。
* 当前 package 版本是 `2.0.0`，`package-lock.json` 根版本是 `2.0.0`。
* npm registry 当前 `cc-fusion` 版本是 `2.0.0`。
* 最新本地 release tag 是 `v2.0.0`。
* `.github/workflows/npm-publish.yml` 在推送 `v*.*.*` tag 时运行 `npm ci`、`npm run build`、`npm publish`。
* 本次发布内容是已验证的 bug fix：`ae91e73 fix: reset completed statusline task batches`，以及相关 spec/task/journal commits。

## Requirements

* 发布 patch 版本 `2.0.1`。
* 更新 `package.json` 和 `package-lock.json` 版本到 `2.0.1`。
* 在发布前执行项目要求的本地验证：`npm test`、`git diff --check`、`npm pack --dry-run`。
* 提交版本 bump commit。
* 推送 `main` 到 `origin`。
* 创建并推送 annotated tag `v2.0.1`，触发 npm publish workflow。
* 监控 GitHub Actions `npm-publish.yml`，失败则停止并报告 blocker，不绕过。
* workflow 成功后确认 `npm view cc-fusion version` 返回 `2.0.1`。
* 创建 GitHub Release `v2.0.1` 到当前 remote 仓库 `Apparux/cc-fusion`。

## Acceptance Criteria

* [ ] `package.json` 和 `package-lock.json` 版本为 `2.0.1`。
* [ ] `npm test` 通过。
* [ ] `git diff --check` 通过。
* [ ] `npm pack --dry-run` 通过。
* [ ] 版本 bump commit 已在 `main`。
* [ ] `origin/main` 包含本次所有工作 commits。
* [ ] tag `v2.0.1` 已推送到 origin。
* [ ] `npm-publish.yml` 对 `v2.0.1` 成功。
* [ ] `npm view cc-fusion version` 返回 `2.0.1`。
* [ ] GitHub Release `v2.0.1` 已创建。

## Definition of Done

* 本地验证通过。
* 远端 push/tag/release 完成。
* npm 发布 workflow 成功。
* npm registry 可见新版本。
* 不绕过失败的 build、publish、authentication 或 token safety blocker。

## Technical Approach

Use the existing release flow: bump version with `npm version patch --no-git-tag-version`, run verification, commit the version files, push `main`, create/push annotated tag `v2.0.1`, monitor the npm publish workflow with `gh`, confirm npm registry, then create a GitHub Release against `Apparux/cc-fusion`.

## Decision (ADR-lite)

**Context**: The previous task produced a verified bug fix and the user requested npm publication.
**Decision**: Publish patch `2.0.1` because the change is a bug fix and current npm/latest tag is `2.0.0`.
**Consequences**: The release is visible externally on GitHub and npm. Any workflow/auth/npm failure stops the process for manual resolution.

## Out of Scope

* Minor/major version bump.
* Changing the npm publish workflow.
* Publishing from a repository other than the current remote `Apparux/cc-fusion`.
* Bypassing failed checks or failed authentication.

## Technical Notes

* Current remote: `origin ssh://git@ssh.github.com:443/Apparux/cc-fusion.git`.
* Current GitHub repo context: `Apparux/cc-fusion`.
* Release workflow path: `.github/workflows/npm-publish.yml`.
* Relevant spec context: backend quality guidelines and project `CLAUDE.md` release flow.
