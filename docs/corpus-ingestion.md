# Curriculum source ingestion

The API accepts text passages. This proposal extends intake to publisher files while retaining reviewed, versioned evidence.

## Implemented intake

The API validates a target in a published design, hashes submitted text, splits paragraphs into chunks of up to 1,200 characters, embeds them at 384 dimensions, and creates a draft source link for a Curriculum Lead to publish. A `defines_target` link requires an official curriculum design, edition, URL, and locator. See [source intake](data-flows.md#source-intake-and-publication).

The seed uses two July 2024 excerpts—the Grade 8 Integrated Science outcome and a key inquiry question—from [KICD Grade Eight designs](https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-eight-designs/), plus seven synthetic supports. It does not store the original PDF.

## Proposed file pipeline

Extend the existing catalogue and source library through these steps:

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
