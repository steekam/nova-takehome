# AI log

- **Tools and use:** Codex and parallel agents supported API and UI work and independent review. Web research checked official NestJS, LiteLLM, Langfuse, OpenTelemetry, Grafana, and BGE guidance. I checked the task PDF and KICD source for product and curriculum requirements.
- **AI output I corrected:** The first schema proposal kept curriculum hierarchy inside source documents. I pushed for a separate, controlled catalogue of editions, grades, subjects, strands, sub-strands, and outcomes, linked to immutable source revisions. This lets generation target known outcomes and keeps source lineage auditable.
- **Decision I made:** I kept source upload out of the thin slice. The demo uses seed/import; I documented a future pipeline that preserves each revision, extracts typed units with page provenance, asks a Curriculum Lead to approve target mappings, then indexes approved material. This protects citation traceability and keeps the required teacher-to-lead workflow in scope.

The brief's user-facing AI call creates a grounded draft; teachers edit it and Curriculum Leads approve it.
