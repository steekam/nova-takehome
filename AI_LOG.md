# AI log

- **Tools:** Codex and web research against official LiteLLM, Langfuse, OpenTelemetry, and Grafana documentation. Used to create the initial pnpm workspace structure, starter web/API files, shared lesson-plan schema, initial Drizzle schema, architecture notes, and reviewer checklist.
- **Mistake caught:** The first explanation presented the brief's AI-generation boundary as my design choice. The user asked for verification; I checked the PDF and corrected the wording. The brief specifies retrieval plus LLM generation, followed by teacher editing and curriculum-lead review; it does not request AI during review.
- **Provisional engineering choice:** I represented embeddings as numeric arrays in PostgreSQL JSONB so the first retrieval slice can avoid a PostgreSQL extension. This needs review when implementing retrieval; the checklist tracks embedding persistence and source integrity.
- **Observability choice:** Keep LiteLLM for routing and spend, Langfuse for prompt/LLM evaluation context, and OpenTelemetry as the telemetry contract. A Collector fans out traces to Tempo and Langfuse; do not export the same proxy trace to Langfuse twice.
