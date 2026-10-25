# Curriculum source ingestion

The system has two implemented paths: Curriculum Leads can submit text through the API, and startup seeds versioned Markdown files from `corpus/grade-8-integrated-science`. Publisher-file extraction remains future work.

## Implemented intake

Manual text intake validates the target and source metadata, hashes the text and pipeline configuration, chunks and embeds it at 384 dimensions, then creates a draft source link for a Curriculum Lead to publish. A `defines_target` link requires an official curriculum design, edition, URL, and locator. See [source intake](data-flows.md#source-intake-and-publication).

The corpus importer reads Markdown frontmatter and body text. It records source format, parser/chunker versions, embedding model, source metadata, and a pipeline fingerprint. Resource-specific chunkers preserve structure: curriculum outcomes and hierarchy, assessment items and shared stimuli, scheme-of-work weeks, or general Markdown sections. Chunks retain heading paths, codes, item/term/week details, and source line or page locators where present. Oversized chunks split at the configured 1,600-character limit. Re-running startup reuses unchanged revisions and links; changed content or pipeline inputs create new revisions. Catalogue records can exist without outcomes or sources; the published design contains the 37 outcomes, and source links associate evidence with each target.

The Grade 8 Integrated Science seed contains all 37 outcomes across eight sub-strands, each linked to its KICD defining excerpt. It also includes eight assessment-support documents (stored as `assessment_items` resources), three schemes of work, and curriculum guidance with typed chunk metadata. The source URLs point to [KICD Grade Eight designs](https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-eight-designs/); the original PDF is not stored in the repo.

## Proposed file pipeline

Extend the pipeline for publisher files through these steps:

1. **Capture:** Register the issuing authority and preserve the original file with its source, release, checksum, and reuse terms.
2. **Extract:** Parse headings and tables into catalogue nodes and target revisions. Split support material by section, activity, or assessment item; retain page, table, row, or text locators. Use OCR for scanned pages.
3. **Propose:** Store candidate fields with their evidence and confidence. A model may suggest ambiguous structure; it cannot assign authority or invent codes.
4. **Review:** Show the source beside a diff. A Curriculum Lead resolves conflicts and approves the change.
5. **Publish:** Publish the reviewed tree and defining links together. Freeze that design version; corrections create a revision.
6. **Index:** Evaluate a candidate index before activation and retain the prior index for rollback.

## Proposed records

Add provenance and build records around the existing entities:

| Record | Contents |
| --- | --- |
| Authority source | Issuer, canonical URL, discovery method, reuse terms |
| File snapshot | Original bytes, checksum, release, final URL, capture time |
| Ingestion run | Parser/OCR versions, page coverage, status, warnings |
| Extraction proposal | Candidate hierarchy/content fields, locators, confidence, review result |
| Index build | Parser, chunking, embedding profiles, evaluation, activation/rollback state |

Resource revisions retain normalized text for chunks; snapshots retain original documents. Source links publish individually in the implemented flow. Published-tree freezing and index rollback are proposed additions.

## Version rules

The histories serve different changes:

- **Publisher release:** create a design edition, source snapshot, and resource revision for its normalized text.
- **Corrected import of the same release:** create a design revision and reuse unchanged evidence.
- **Changed file or extracted text:** create a snapshot when bytes change and a resource revision when normalized text changes. Revise the design if curriculum content changes.
- **Rechunking or re-embedding:** create an index build.

Saved plans retain target revision and cited chunk IDs. Imports must preserve those references.

## Acceptance checks

Before activation, confirm these properties:

- Outcome codes and wording remain exact and have source locators.
- Every generation retrieves the published official defining source.
- Supporting retrieval is measured with Recall@6 and nDCG.
- The prior index remains available for rollback.
