# Security Policy

## Reporting a vulnerability

Please report security issues **privately**, not in a public issue or PR.

- Use GitHub's [private vulnerability reporting](https://github.com/BeyondITL/contentine-create/security/advisories/new) ("Report a vulnerability" under the Security tab), or
- Open a minimal public issue that says only "security — please provide a private contact" and a maintainer will follow up.

Please include: affected version/commit, a description, reproduction steps, and the impact you foresee. We'll acknowledge, investigate, and coordinate a fix and disclosure timeline with you.

## Scope notes

- **Secrets:** this repository contains no live secrets. Real configuration lives in `admin_config.php` (one directory above the webroot, gitignored) and in `.env*.local`. If you ever find a committed secret, treat it as a vulnerability and report it privately.
- **On-device by design:** core creation runs in the browser; user media need not leave the device. Findings that break that guarantee are in scope.
- **Gated models:** image generation and any Stability-derived model ship disabled by default (`NEXT_PUBLIC_IMAGE_GEN_ENABLED`). Enabling them is an operator decision with license obligations (see `NOTICE`).

## Supported versions

This is a pre-1.0 project; security fixes land on `main`. Pin a commit for reproducibility.
