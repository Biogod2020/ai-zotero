# Validation status — 0.1.0 Preview

## Executed in the development container

- Node v22.16.0: **41/41** core and mocked-Zotero service tests passed. Run `npm test` to obtain the current count.
- Chromium with the **actual UI code** and a clearly fictional offline bridge: **11/11** smoke checks, zero page errors. Covers local query, library/radar/organization navigation, assistant response/citations, preserving edited settings when collapsing assistant, dark theme, inert XSS-like titles, semantic-mode persistence, and 980px viewport overflow.
- All plugin JS parsed with `node --check`. XPI build checks root manifest/bootstrap, ZIP integrity and records a SHA-256 digest.
- Synthetic performance sample (5,000 documents, not real PDFs): local index build ~889 ms; 50 searches median ~4.86 ms, p95 ~6.47 ms; ranking 100 radar papers ~618 ms; Node heap ~72 MB. These numbers are environment-specific, not a speed guarantee. Run `npm run benchmark`.

Core/service tests cover DOI/arXiv identity normalization, arbitrary-port endpoint paths, remote HTTP consent, unsafe filenames and URLs, Chinese query aliases, filters, index removal, embedding scope separation, duplicate conflicts/fanout, seed matching, date windows, zero-call local search, content-cache invalidation, retry budget, endpoint-specific secret storage, redirection/error-body privacy, malformed AI output, deletion during model requests, query vector caching, additive organizing and idempotence, conservative undo, auto-organization undo opt-out, group-library restrictions, file rename conflict/undo, linked-file source retention, fresh DOI/PMID merge checks, Europe PMC fixture parsing, truncation/failure coverage, duplicate-safe radar import, multimodal payload/reference construction, corrupt-state preservation including shutdown, queue draining, and storage-failure pause.

## Not yet verified

**No native Zotero desktop end-to-end run was possible in this environment.** Attempting to download the native Linux build failed. There was no user desktop connection and no live AI key. Native XUL menu registration, login-manager behavior, Zotero 7/8/9/10 version-specific APIs, actual PDF text extraction, actual attachment/annotation migration, real model compatibility, and live arXiv/Europe PMC responses remain integration acceptance checks. Browser fixtures are not evidence of native Zotero compatibility.

The manifest's 7–10 range is an implementation target. Upgrade to a stable release label only after the matrix below passes, especially on the user's actual OS and Zotero version.

## Native acceptance checklist (disposable profile + backed-up library)

1. Install XPI, restart/disable/enable: one tools menu entry and shortcut; no residual windows/listeners after disable.
2. Add 20 test papers, PDF with selectable text and one scanned PDF. Confirm local-only indexing, no API traffic before consent, honest text-coverage labels. Delete/modify parent and attachment; confirm reconciliation.
3. Connect localhost with arbitrary port and an HTTPS provider using different keys. Test text, image, embedding separately. Inspect provider-side usage while repeating an unchanged AI index and a cached query.
4. Interrupt indexing, restart, hit daily quota, and advance to the next day; confirm retry/deferred queues. Simulate 401/429/503 and network timeout.
5. Group a test paper with an existing human tag and collection. Undo; confirm user data remains and automatic grouping does not instantly re-add it. Edit after grouping and verify conservative undo refusal.
6. Copy duplicate papers with identical DOI, conflicting DOI and conflicting PMID. Only exact-compatible pairs may merge, always after confirmation. Verify chosen master, attachments, annotations and citations.
7. Rename a stored test PDF with annotations, undo, simulate filename collision. Convert a linked copy; verify original disk file stays, annotations survive, and replacement attachment key behavior is understood.
8. Enable each radar source separately; verify raw source coverage against the query, failure/cache status, pagination and late-indexed papers. Seed matching is heuristic, not a novelty judgment.
9. Open a working PDF from search results; assistant citations locate real Zotero items. Upload PNG/JPEG/WebP, test clipboard/drop, verify the selected model actually supports images.
10. Close/reopen Zotero and inspect queues, atomic backups, cost ledger and optional startup workspace. Check a shared group remains untouched.

When reporting bugs, include OS, Zotero version, plugin version, synthetic reproduction and sanitized error message. Never attach real keys or the whole cache.
