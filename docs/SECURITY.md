# Security & Sandbox Specification

Vidilearn is built to handle untrusted input (e.g. web pages, public RSS feeds, and unknown GitHub repositories) safely.

---

## 1. Input Sanitization & Shell Safety

* **Command Injection Prevention**: All command invocations (like calling `ffmpeg` or `git`) use explicit string arguments without shell interpolation or shell spawning. This prevents command injections via malformed filenames.
* **Path Sanitization**: User-supplied paths are validated to ensure they remain inside the target execution context. Paths are resolved using `path.resolve()` and checked against directories to prevent path traversal attacks (`../../`).

---

## 2. Safe Repository Ingestion

Cloning remote GitHub repositories poses risk of executing untrusted project code.
* **Cloning Isolation**: Git clones are checked out inside a randomized temporary directory with restricted permissions.
* **Non-Execution Contract**: Ingestion only performs file reads. No build scripts, tests, compilers, or commands within the ingested repository are run.
* **File Size & Recursion Limits**: Code files are capped at 2MB per file and a maximum directory traversal depth of 6 levels is enforced to prevent filesystem flooding (ZIP bombs).

---

## 3. Browser Sandboxing

Dynamic web scrapers run Playwright inside a sandboxed chromium instance:
* Headless mode is active.
* GPU and audio outputs are disabled.
* Content security policies are strictly enforced to block execution of unrecognized external scripts.
