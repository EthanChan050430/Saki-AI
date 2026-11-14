# Saki-AI Memory Reliability and Quality

## Durable capture queue

An enabled-memory Agent response is acknowledged only after its capture job has
been written to `data/memory_capture_jobs.json`. The queue runs independently,
keeps failed jobs, retries with exponential backoff (up to 8 attempts), and
resumes `running` jobs as `pending` when the backend starts again.

Capture jobs use the current provider/model selection and read the latest
configuration when processed. Raw conversation text is stored in the queue until
the job completes; protect the `data/` directory appropriately. Replaying a job
uses its stable chat/message identifier and working-memory writes are idempotent.
If eight attempts fail, the record remains in `failed` state instead of being
silently discarded. `MemoryCaptureQueue.retryFailed()` can explicitly
requeue those records.

Existing opt-in behavior is preserved: memory remains disabled unless the user
enables it or explicitly asks to remember something. The backend must be
restarted to load these code changes.

## Scoped JSON serialization

Read-modify-write transactions in `MemoryService` are serialized by physical
storage path. Memory upsert, deletion, access counters, short-term buffers,
session snapshots, sleep queue, knowledge graph, vectors, and working-memory
files now use serialized writes where applicable. Writes are performed through
temporary files and rename. Corrupted JSON storage is not silently replaced by
an empty object.

This protects concurrent tasks and multiple `MemoryService` instances *within
one Node.js process*. Running multiple backend processes against the same
`data/` directory is NOT supported without an interprocess file lock or
single-writer service.

## Forgetting and recovery

Deleting a memory places a hashed deletion barrier before cleanup. Its
temporary purge snapshot is removed on successful cleanup, preventing
automatic promotion or legacy import from recreating that memory. A pending
purge is resumed when the backend starts.

Deletion now targets the long-term record, vector, original memory mirror,
sleep queue, short-term buffers, working-memory snapshots, session-state
summaries, cold decisions, graph entries and archive Markdown containing the
deleted text. Related queued captures are also dropped. Traces for which no
exact text or source linkage exists (for example, paraphrased graph facts)
cannot always be proven gone. Original chat history in `data/sessions/` and
user files are deliberately NOT deleted. Full privacy erasure may require
separate deletion of those source records, backups and external copies.

## Sleep cycles and changing facts

Sleep consolidation and offline reflection are **manual-only**. New conversation
candidates may still be staged, but the application does not promote them from
the sleep queue on a timer, at startup or after capture. In Memory Manager,
select **Review & correct**, adjust each pending candidate, and approve or
discard it explicitly. Short-term topics may still be pruned for retention.

Fact records may include a stable `factKey` and `factValue`. Rewriting the same
fact key replaces the current value and moves the old version to `history`
with a validity window. Extraction prompts request stable keys for changing
facts. Memories without such keys retain existing merge behavior, so semantic
contradictions without a shared key may still need manual reconciliation.

Offline reflection excludes credential-named files and redacts common secrets
from text sent to the reflection model. This is defense in depth, not a
guarantee of complete secret detection.

## Manual reflection using the configured chat model

The model is now selected using the current `provider` and `model` configuration,
including OpenAI-compatible, Anthropic, Gemini, DeepSeek, custom API endpoints,
Ollama and LMStudio. Legacy local-only reflection settings do not override
the active model. API keys remain server-side and use the same provider
configuration as ordinary chat.

From Memory Manager → **Review & correct**:

1. Choose a local calendar date with saved conversations or changed files.
2. Click **Generate suggestions** (remote API requests may incur charges).
3. Review the persisted draft. Edit names, summaries, content, and fact keys;
   uncheck unwanted items. Graph entities/relations start unchecked.
4. Click **Save draft**, **Approve and commit**, or **Discard**.

The model generation operation writes only to
`data/memory_review_draft.json`; it does not change long-term memory or
the knowledge graph. Drafts survive backend restart and can only be committed
after a separate explicit action. A conflicting draft must be reviewed or
discarded before generating again.

The pending sleep queue can be reviewed individually in the same panel;
approving or discarding an item changes only that selected candidate.

Backend API:

- `GET /api/memory/review`: model selection, pending queue, current draft.
- `POST /api/memory/review/generate`: generate a draft with `dateKey`.
- `PATCH /api/memory/review/draft`: persist corrections to a draft.
- `POST /api/memory/review/commit`: explicitly commit selected items.
- `DELETE /api/memory/review/draft/:id`: discard an uncommitted draft.
- `POST /api/memory/review/pending/:id`: approve/discard an individual candidate.

Automatic turn-level memory extraction (when memory is enabled) is separate
from manual offline reflection and remains in place. A previously enabled
`offlineReflectionEnabled` setting does **not** reenable automatic reflection.

## Quality monitoring

Read-only aggregate health endpoint:

`GET /api/memory/quality`

From `backend/`:

```sh
npm run memory:quality
npm run memory:quality -- --store D:\Saki-AI\data\memory_store.json
npm run memory:quality -- --store D:\Saki-AI\data\memory_store.json --cases D:\path\labeled-cases.json
```

Labeled cases are an array of `{"query":"...","expectedIds":["memory-id"]}`
objects (empty `expectedIds` means a negative query). The evaluator reports
Hit@1, Hit@3, MRR and negative-query specificity, plus storage health signals:
missing/stale/orphan vectors, duplicate fact keys, unsourced auto memories,
unresolved deletions and capture queue failures.

The default set is synthetic, and the CLI currently evaluates lexical retrieval.
It must not be interpreted as real-world model accuracy; collect representative
labeled conversation data for a production benchmark.

Run `npm test` from `backend/` for reliability/regression tests.
