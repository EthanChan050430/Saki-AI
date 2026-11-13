# EGAR experiment report

Isolated Python prototype; not integrated into Saki production tools. The existing agentTools.js registry was inspected but not reused: it exposes filesystem/network/terminal tools inappropriate for an isolated read-only experiment.

## Frozen protocol
24 seeded held-out instances per model, four conditions, maximum four action steps. Direct permits one proposal per step; schema permits one repair on schema failure; EGAR permits one repair on schema or public-evidence failure. generic_egar uses the identical gate and maximum budget but generic rejection feedback. This is an equal maximum-budget diagnostic-feedback ablation, not equal realized token expenditure.
All conditions receive identical initial instructions and strict JSON parsing without constrained decoding. Requests use temperature 0, context 4096, output cap 192, sequential local Ollama HTTP with 240-second timeout. Six missing-record cases per model; eighteen answerable. Condition order rotates within task; models run in groups. No evaluation values are passed to prompt construction or evidence validation.

## Actual outcomes
Completed episodes: 192 / 192.

| Model | Condition | Correct / n | Calls | Output tokens | Seconds | Validation errors | Transport failures |
|---|---|---:|---:|---:|---:|---:|---:|
| gemma3:4b | direct | 0/24 | 24 | 503 | 136.3 | 24 | 0 |
| gemma3:4b | schema | 0/24 | 48 | 2056 | 48.7 | 48 | 0 |
| gemma3:4b | egar | 0/24 | 48 | 1926 | 46.0 | 48 | 0 |
| gemma3:4b | generic_egar | 0/24 | 48 | 1737 | 42.6 | 48 | 0 |
| llama3.1:8b | direct | 15/24 | 72 | 1220 | 179.7 | 0 | 0 |
| llama3.1:8b | schema | 15/24 | 72 | 1220 | 71.3 | 0 | 0 |
| llama3.1:8b | egar | 21/24 | 81 | 1337 | 77.8 | 12 | 0 |
| llama3.1:8b | generic_egar | 17/24 | 81 | 1398 | 80.9 | 16 | 0 |

## Paired comparisons
Differences are proportions (EGAR minus control); percentile paired task bootstrap, 10,000 resamples.
- gemma3:4b, egar minus direct: +0.000, descriptive 95% interval [0.0, 0.0]; n=24, wins/losses/ties=0/0/24.
- gemma3:4b, egar minus schema: +0.000, descriptive 95% interval [0.0, 0.0]; n=24, wins/losses/ties=0/0/24.
- gemma3:4b, egar minus generic_egar: +0.000, descriptive 95% interval [0.0, 0.0]; n=24, wins/losses/ties=0/0/24.
- llama3.1:8b, egar minus direct: +0.250, descriptive 95% interval [0.08333333333333333, 0.4166666666666667]; n=24, wins/losses/ties=6/0/18.
- llama3.1:8b, egar minus schema: +0.250, descriptive 95% interval [0.08333333333333333, 0.4166666666666667]; n=24, wins/losses/ties=6/0/18.
- llama3.1:8b, egar minus generic_egar: +0.167, descriptive 95% interval [0.041666666666666664, 0.3333333333333333]; n=24, wins/losses/ties=4/0/20.

## Reproduction
```powershell
Set-Location D:\Saki-AI\research\small-model-agent
python -m unittest -v test_experiment.py
python experiment.py freeze
python experiment.py run
python experiment.py summarize
```

Results append to results.jsonl; completed episode keys are skipped on resume. A crash before outcome reruns that episode with a new attempt_id; partial attempts remain auditable. Freeze hashes cover benchmark, protocol, implementation and tests; run refuses a changed file. environment.json records Ollama version and model digests. Each request, raw response, parsed action, validation error, executed observation, usage, latency and outcome is retained.

## Limitations
Synthetic catalogue lookup with distractors is narrow and contains repeated task families, not independent real-world tasks. No training or prompt tuning was performed on these held-out instances. Exact-value scoring does not itself require valid citation in controls; EGAR enforces citation and copying at runtime. Semantic failures in controls are intentional ablations; malformed proposals never execute, and all executable tools are allowlisted in-memory reads. Shared deterministic seeds do not guarantee bitwise GPU reproducibility. Temperature-zero single trials omit sampling variability. Bootstrap intervals are descriptive and unadjusted for multiple comparisons; small n and related tasks limit inference. Gate overhead and cold-load cost are included in wall latency but no randomized model-order crossover is performed. Transport failures count as failures; their latency is in network_error events, not successful-call latency totals. No large-model parity or global novelty claim is supported.
