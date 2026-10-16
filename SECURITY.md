# Security Policy

`couchman` writes design documents to CouchDB databases, often production ones, and handles database credentials. We take security reports seriously.

## Supported versions

Only the latest published release and the current `main` branch receive security fixes. Please reproduce the issue on the latest version before reporting.

| Version        | Supported |
| -------------- | --------- |
| latest release | yes       |
| `main`         | yes       |
| older releases | no        |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use one of these private channels:

1. **GitHub private vulnerability reporting** (preferred): go to the [Security tab](https://github.com/strkopiesok/couchman/security) and click *Report a vulnerability*.
2. **Email**: `security@example.com` (replace with a real address before publishing).

Please include:

- affected version or commit,
- a description of the issue and its impact,
- steps to reproduce, ideally a minimal directory tree and config,
- your Node.js and CouchDB versions, if relevant.

### What to expect

| Step                       | Target       |
| -------------------------- | ------------ |
| Acknowledgement of report  | 5 days       |
| Initial assessment         | 10 days      |
| Fix or mitigation released | 90 days      |

This is a small project maintained in spare time, so these are targets, not guarantees. We will keep you informed and credit you in the release notes unless you prefer to stay anonymous. Please allow us to release a fix before you disclose publicly.

## Scope

In scope, for example:

- Leaking credentials (`COUCHMAN_USER`, `COUCHMAN_PASSWORD`, URLs with embedded credentials) into logs, `--json` output, error messages, plans, or written files.
- Bypassing write protections: `protected: true` environments, plan confirmation, `--prune` confirmation, the `managed` marker, or the `_rev` conflict check, resulting in unintended writes or deletes.
- Path traversal or reading files outside the project tree, including imports that escape `_lib/` or `shared/` at build time, and crafted filenames or fixtures.
- Code execution on the machine running `couchman` caused by untrusted input (a malicious config, tree, fixture, or `pull` response from a database).
- Insecure handling of TLS or authentication when talking to CouchDB.
- Supply chain problems in the published package or its release process.

Out of scope:

- Vulnerabilities in CouchDB, Clouseau, SpiderMonkey, Node.js, esbuild, or other dependencies. Report those upstream. We will update dependencies once a fix exists.
- JavaScript you write in design documents. It runs inside the CouchDB query server by design.
- Credentials committed to your own repository, or a database that is exposed or misconfigured.
- Issues that require an already compromised machine or a malicious maintainer.
- Denial of service through very large input trees or slow index builds.

## Safe usage notes

- Pass credentials through environment variables, never commit them, and keep `.env` in `.gitignore`.
- Use `https://` URLs for any CouchDB that is not on localhost.
- Mark production environments with `protected: true`.
- Run `couchman plan` in CI and review it before `push`.
- Do not put secrets or password hashes in fixtures.
- Use a CouchDB account with only the permissions needed to manage design documents.
- Review the output of `couchman pull` before committing it. It may contain data you did not intend to publish.

## Safe harbor

If you act in good faith, avoid privacy violations and data destruction, test only against your own systems, and follow this policy, we will not pursue legal action over your research.
