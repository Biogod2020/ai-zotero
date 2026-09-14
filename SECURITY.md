# Data boundaries and safe reports

Preview software: back up a test library before use. Do not publish your Zotero cache, API keys, full private PDFs, patient information, `state.json`, or raw request dumps in GitHub issues.

The plugin has privileged Zotero API access. LLM output does not: no tool execution, shell, arbitrary file read, or automatic URL follow-up is exposed to the model. Paper content and cached analyses are treated as untrusted evidence. This reduces exposure but does not make model output factually reliable or immune to prompt injection; review AI-generated grouping.

AI requests are opt-in, bounded and non-streaming. Authentication is stored with Mozilla's login manager, scoped by endpoint. Keys are not synced by this plugin. Plain HTTP to remote machines needs explicit opt-in. AI requests reject redirects. Do not assume request-count quotas are monetary budgets.

All library writes use Zotero APIs and require personal-library editability. Broad library analysis can be automatic only after the corresponding settings are enabled. Merge and linked-file conversion require explicit UI confirmation and are not undoable by this plugin. Read the README for the exact attachment replacement behavior.

Operation journals use write-ahead records and conservative undo. Interrupted `prepared` records are marked for manual review, never blindly replayed. This is not a substitute for a database/filesystem backup. Caches are plain local JSON and may contain sensitive text; protect the Zotero data directory using normal OS access controls and backups.

For a suspected vulnerability, report a minimal synthetic reproduction without personal data or credentials. If a token was accidentally disclosed, revoke it at the provider first.
