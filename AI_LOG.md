# AI log

- **Tools and use:** I used Codex and parallel review agents to inspect the
  codebase, shape the API and web architecture, implement features, and review
  changes. I used web research for provider, Langfuse, and OpenTelemetry
  integration guidance, then checked behavior with the project build and test
  commands.
- **AI output I corrected:** An early schema proposal kept curriculum
  hierarchy inside source documents and treated printed outcome locators as
  stable identifiers. I caught the problem while modeling new grade/subject
  paths and curriculum editions. I separated the controlled catalogue
  hierarchy from library resources, immutable revisions, chunks, and explicit
  target-to-source links. Internal UUIDs identify targets; publisher locators
  remain scoped to a design version.
- **Decision I made:** I kept document upload, extraction, and a full approval
  UI out of this slice, despite AI-generated proposals to add that pipeline.
  Seed/import data populates versioned resources; source links preserve role
  and publication state. This keeps the corpus auditable while prioritizing
  the required grounded generation, teacher editing, and Curriculum Lead
  review flow.
