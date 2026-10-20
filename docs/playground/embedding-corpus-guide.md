# Embeddings and corpus notes

This guide records the current retrieval design, the choices worth tuning, and the signals that should guide those choices. It is a working note for the CBC lesson-planning slice, not a claim that the current small fixture represents the full curriculum.

## Data path

```mermaid
flowchart LR
  A[PDF / spreadsheet / notes / exemplar] --> B[Format-aware parser]
  B --> C[Canonical source record<br/>provenance + curriculum metadata + locator]
  C --> D[Meaningful, typed chunks]
  D --> E[One pinned embedding pipeline]
  E --> F[Dense retrieval + structured filters]
  F --> G[Required-evidence coverage + citations]
  G --> H[Grounded generation]
```

Keep source authority and provenance in structured metadata. Similarity ranking measures topical fit; it does not establish that a source is official, current, or sufficient. Enforce curriculum, grade, status, and source-type rules through filters and workflow policy.

## Current baseline

- The task asks for 8–12 short documents with multiple source types and source references. The particle fixture currently has nine chunks across curriculum target, scheme, teaching note, assessment, lead guidance, and exemplar types.
- Current particle chunks range from 8 to 104 words. They are already short semantic units; preserve them intact until evaluation shows that a passage is too broad or combines independent ideas.
- The playground uses `Xenova/bge-small-en-v1.5`, 384 dimensions, query instruction prefix, normalized vectors, and exact in-memory ranking. The API embedding adapter also currently requests mean pooling.
- The model card lists BGE-small at 384 dimensions and a 512-token sequence length. Its official guidance says to use the `[CLS]` vector; it warns that mean pooling can significantly reduce performance. Treat pooling as the first controlled diagnostic. Keep query prefix and corpus text fixed, compare CLS with mean, and use a new pipeline/cache version so vectors are regenerated.
- BGE's short-query-to-passage instruction belongs on queries, not passages. The current prefix is `Represent this sentence for searching relevant passages:`. Keep the same model revision, preprocessing, pooling, normalization, and dimensions for every vector in an index.

Sources: [BGE-small model card](https://huggingface.co/BAAI/bge-small-en-v1.5), [FlagEmbedding BGE usage and pooling guidance](https://github.com/FlagOpen/FlagEmbedding/blob/master/research/baai_general_embedding/README.md), [task specification](../../nova-fullstack-performance-task.pdf).

## Tuning choices

| Choice | Starting point | Change it when | Signal |
| --- | --- | --- | --- |
| Chunk boundary | One outcome, guidance point, activity, or assessment item | Relevant details are buried in a broad passage or split from needed context | Recall@K, nDCG@K, source locator accuracy |
| Chunk length | Keep current semantic chunks | Queries repeatedly need finer or broader context | Direct-evidence recall versus irrelevant context |
| Overlap | None | A boundary cuts a sentence or dependency needed to interpret a chunk | Boundary-query recall versus duplicate results |
| Embedding model/dimensions | BGE-small at its native 384 dimensions | Held-out retrieval quality justifies the added compute and storage | Labeled retrieval metrics, latency, memory |
| Top-K | Compare 4, 6, and 8 after required-source selection | Coverage or context noise changes with K | Required-source coverage, precision, context size |
| Vector index | Exact search for this fixture | Corpus size makes measured latency unacceptable | Recall against exact results and query latency |

Chunk-size research does not identify one universal setting. One multi-dataset study found 64–128-token chunks better for concise factual retrieval and 512–1024-token chunks better where broad context mattered; the best size also varied by embedding model. These are experimental findings, not defaults for this short corpus. [Bhat et al., *Rethinking Chunk Size for Long-Document Retrieval*](https://arxiv.org/abs/2505.21700)

Dimensions are a model property, not a free quality knob. Float32 vectors use about 4 bytes per dimension before database overhead: 384 dimensions are about 1.5 KiB per vector; 768 are about 3 KiB. MTEB found no embedding method dominated all tasks, so select by the project's held-out retrieval queries rather than a general leaderboard. [MTEB paper](https://arxiv.org/abs/2210.07316)

With pgvector, a fixed vector column declares its dimension. Exact search gives a useful recall baseline; approximate indexes trade some recall for speed. Avoid tuning HNSW or IVFFlat until corpus scale and latency measurements call for an index. [pgvector documentation](https://github.com/pgvector/pgvector)

## Corpus format variance

Accept source-format variation at ingestion, then normalize to one canonical record. Keep the original source and its locator so generated citations can resolve to a human-readable passage.

| Source format | Preserve while parsing |
| --- | --- |
| Curriculum PDF | Page, section heading, outcome code, table headers and row; flag OCR uncertainty |
| Scheme spreadsheet | Workbook, sheet, row, column headers, term/week |
| Assessment item | Stable item ID, prompt, marks, expected evidence |
| Lead note | Author/role, grade or subject scope, effective status/date |
| Lesson-plan exemplar | Provenance, approval status, reusable section and context |

Suggested normalized shape:

```json
{
  "sourceId": "scheme-g8-is-term-1-v1",
  "sourceType": "scheme",
  "curriculum": "Kenya CBC (KICD)",
  "grade": "Grade 8",
  "subject": "Integrated Science",
  "version": "1",
  "status": "approved",
  "provenance": { "synthetic": true, "authorRole": "curriculum_lead" },
  "locator": { "sheet": "Term 1", "row": 8 },
  "text": "..."
}
```

Derive chunks with stable IDs and inherited metadata: source ID, chunk kind, curriculum/grade/subject, outcome IDs, locator, chunker version, and text. Preserve source text separately from any formatted text used for embedding. Keep synthetic status and source authority visible to retrieval policy.

## Evaluation signals and diagnosis

Build a labeled set with varied intents: outcome selection, paraphrased lesson focus, activity guidance, assessment evidence, lead constraint, and exact code/phrase lookup. Label query–chunk pairs `2` for direct evidence, `1` for useful support, and `0` for irrelevant. Include hard negatives and hold out some queries or source revisions.

| Signal | What it answers |
| --- | --- |
| Recall@K | Did retrieval find all evidence needed for the task? |
| nDCG@K | Did direct evidence rank above secondary support? |
| Hit@1 / MRR | How early does the first direct answer appear? |
| Required-source coverage | Did outcome, lead guidance, focus, activity, and assessment evidence arrive? |
| Irrelevant-context rate | How much noise is passed to generation? |
| Citation accuracy | Does each source ID resolve to the cited source and locator? |
| Latency and cache hit rate | Is embedding or search slowing the run? |

Use symptoms to localize the failure:

- Expected evidence is missing: inspect corpus coverage, parsing, and target-to-source links.
- Source exists but ranks low: compare pooling, query phrasing, chunk boundaries, and embedding representation.
- Wrong grade, curriculum, or authority ranks high: fix metadata filters and source policy.
- Exact code or name is missed: test lexical retrieval or hybrid search.
- Correct evidence arrives but output is ungrounded: inspect prompting, citation mapping, and deterministic verification.

Do not treat cosine similarity as a confidence threshold. The current eight-query fixture evaluation has a non-answer scoring above direct evidence, and its small synthetic-heavy labels cannot establish a general CBC retrieval policy. Keep required-evidence coverage gates and assess ranking with labeled queries. See [retrieval evaluation](retrieval-evaluation.md) for current scores and limits.

## Next checks

1. Compare BGE CLS pooling with current mean pooling on the same labeled queries and corpus.
2. Pin an immutable model revision for reproducible reports; include pooling and preprocessing in the pipeline/cache identity.
3. Add held-out queries and real CBC sources before choosing chunk-size or model changes.
4. Compare semantic chunks with selective splits of long notes; keep other variables fixed.
5. Track retrieval quality and exact-search latency before introducing approximate vector indexing.
