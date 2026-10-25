# AI log

I used Codex for codebase exploration, implementation, tests, and documentation. Sub-agents reviewed independent areas. I checked proposals against the task PDF, source code, and runnable workflows; I used primary documentation for provider and observability integrations.

## Proposal I rejected

An early AI-assisted schema kept curriculum hierarchy inside curriculum source documents. I tested it against adding another grade or subject and importing a correction to the same release. The document could not serve as both a stable curriculum identity and changing evidence without mixing their histories.

I chose a structured catalogue with offerings, design versions, hierarchy nodes, and target revisions. Source resources have their own revisions and link to the target they support. A plan version can now retain its selected target and exact source chunks.

## Decision I made

I kept source intake to text and metadata. Each update creates a new source revision and draft target link; a Curriculum Lead publishes the link separately. I left file upload, extraction, and source-management screens out. This keeps source history and review control while focusing the demo on the required generate, edit, submit, review, and publish workflow.
