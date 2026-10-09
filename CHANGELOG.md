# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial public open-source release under AGPL-3.0.
- Community files: README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, SUPPORT, ROADMAP, NOTICE, CLA.
- `.claude/` project configuration (laws, hooks, subagents, domain skills) for Claude Code contributors.
- GitHub issue/PR templates and a CI workflow (frontend lint/build, backend `php -l`).

### Changed
- Admin identification is now configured via `NEXT_PUBLIC_ADMIN_EMAIL` instead of a hardcoded address.
- The `/api` front-controller shim derives the backend path relatively (no environment-specific absolute paths).

### Security
- Verified no secrets are present in the tree or git history before publishing.

[Unreleased]: https://github.com/BeyondITL/contentine-create/commits/main
