# Security Policy

## Reporting a vulnerability

Please report security issues privately via [GitHub Security Advisories](https://github.com/josh-hemphill/chm-markdown-transpiler/security/advisories/new) or by opening a minimal private disclosure issue if advisories are unavailable.

Do not file public issues for unpatched vulnerabilities.

## Untrusted input

CHM files are untrusted binary archives. Treat conversion of files from unknown sources like opening untrusted archives:

- Run conversions in isolated CI jobs or containers when possible.
- Apply resource limits (disk, memory, time) for automated pipelines.
- Do not expose the CLI to unauthenticated remote upload without sandboxing.

## Supported versions

Security fixes are applied to the latest release on npm (`@chm-md/cli` and related packages).
