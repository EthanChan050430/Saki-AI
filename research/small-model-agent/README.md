# Reproducing the isolated EGAR experiment

Requires Python 3.12 (standard library only), local Ollama at http://localhost:11434 and installed `gemma3:4b` and `llama3.1:8b`. No cloud endpoints or production tool execution are used.

From PowerShell:

```powershell
Set-Location D:\Saki-AI\research\small-model-agent
python -m unittest -v test_experiment.py
python experiment.py freeze
python experiment.py run
python experiment.py summarize
python analyze_results.py
```

`freeze` refuses to change existing frozen content. `run` checks SHA256 hashes and skips completed model/task/condition keys in results.jsonl. On this completed checkout it performs no new inference. To conduct an independent replication, copy the experiment into a new project-local directory without results.jsonl or environment.json, retaining frozen inputs and manifest. Preserve original results. Partial attempts before an interrupted episode outcome remain logged with unique attempt_id; an interrupted episode starts again on resume. A truncated JSONL line requires explicit archival/repair rather than silent data loss.

## Files

- experiment.py: seeded catalogue benchmark, strict parser, read-only tools, evidence gate, local client, resumable runner and summary.
- test_experiment.py: eight offline tests covering leakage, determinism, validation, budgets and normal tool errors.
- benchmark.json, protocol.json, freeze-manifest.json: inputs and hashes frozen before model calls.
- environment.json: runtime Ollama version, model digests and start timestamp.
- results.jsonl: complete prompts, responses, usage, parsed actions, validation failures, executed observations and episode outcomes.
- aggregate.json, detailed-aggregate.json: machine-readable metrics and paired contrasts.
- experiment-report.md: generated experiment overview.
- results-detail.md: derived costs, failures, termination and caveats.
- analyze_results.py: post-run descriptive analysis; not part of frozen inference implementation.

## Important interpretation

The `schema` label denotes post-generation strict JSON parsing, field/type validation and repair; **no experimental arm sends Ollama `format` or uses JSON Schema constrained decoding**. Gemma's fenced-JSON failures therefore do not demonstrate failure of Ollama constrained decoding. For the completed Chinese manuscript see [paper.zh-CN.md](paper.zh-CN.md), with source verification and scientific limitations.

The condition `generic_egar` shares EGAR's identical gate and maximum eight-call budget; its repair feedback omits the specific validation error. It is an equal-cap feedback ablation, not an ungated retry baseline or an equal-realized-token comparison. `schema` gets ordinary tool observations/errors but only schema failures trigger its within-step repair. `direct` is capped at four calls. Every arm has four action steps, with at most one retry per step except direct. Rejections consume inference calls. This differs from an arbitrary pooled budget B: unused retries cannot be transferred to another step.

The answer gate checks an actually read record, exact service/region provenance, and verbatim copying of the requested public field. It does not receive or access private gold, but is domain-specific and stronger than generic schema validation. Abstention requires a completed catalogue listing with no exact match. The exact terminal evaluator is separate and ignores citation in controls. This benchmark measures narrow lookup, not open-ended reasoning, and cannot establish general agent superiority or novelty. Tool-feedback repair and pre-execution provenance checking have close prior work; consult the parent literature review, including CRITIC and RubricRefine. Production Saki agentTools.js was inspected but deliberately not reused to avoid exposing real write/network/terminal operations.
