# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Teachers create, edit, and submit CBC lesson plans.
- Curriculum leads review submitted plans, return them with feedback, or publish them.

## Product Purpose

Curriculum Design Hub helps teachers draft lesson plans grounded in curriculum outcomes and sources, then supports a review and publication workflow. Success means teachers can prepare and submit a usable plan and curriculum leads can make a clear, informed decision.

## Positioning

Plan generation starts from a selected curriculum outcome and retrieved source material. Plans carry source references and quality checks through teacher editing and curriculum-lead review.

## Operating Context

Teachers work with drafts, returned plans, and plans published by curriculum leads. Curriculum leads review submitted plans. Both roles can access published plans. Published plans are read-only.

## Capabilities and Constraints

- Teachers select an outcome and lesson length, generate a draft, edit it, save changes, and submit it for review.
- Curriculum leads review submitted plans, publish them, or return them with feedback.
- Submission and publication depend on lesson-plan quality checks, including valid structure, matching activity durations, and citations from the plan's retrieved source set.
- Returned plans need an edit and resubmission before another review.
- The API exposes existing outcomes, curriculum sources, plans, plan details, updates, submissions, and review decisions. It does not expose curriculum-management APIs.
- The web app uses role guards for teacher and curriculum-lead routes.

## Brand Commitments

The product is **Curriculum Design Hub**, by Nova Pioneer. The app uses Nova Pioneer's multicolor mark and Montserrat Variable, bundled locally. Branding sources are recorded in `docs/branding.md`.

## Evidence on Hand

- Seeded demo accounts and curriculum data are documented in `README.md`.
- Product behavior and workflow constraints are documented in `docs/architecture.md`.

## Product Principles

- Give each role a clear home for each job.
- Keep authoring, review, and published reading in dedicated workspaces.
- Keep lesson content and review evidence visible while users act on it.
