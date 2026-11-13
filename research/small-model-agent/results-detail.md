# Detailed measured results

Episodes: 192/192; responses: 474; approximate elapsed seconds: 683.69.
Total output tokens: 11397; prompt-evaluation tokens: 132026.

| Model | Arm | Success/n | Mean calls | Mean output tokens | Mean prompt tokens | Mean seconds | Missing /6 | Answerable /18 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| gemma3:4b | direct | 0/24 | 1.000 | 20.958 | 205.000 | 5.679 | 0 | 0 |
| gemma3:4b | schema | 0/24 | 2.000 | 85.667 | 451.958 | 2.028 | 0 | 0 |
| gemma3:4b | egar | 0/24 | 2.000 | 80.250 | 451.958 | 1.915 | 0 | 0 |
| gemma3:4b | generic_egar | 0/24 | 2.000 | 72.375 | 452.958 | 1.776 | 0 | 0 |
| llama3.1:8b | direct | 15/24 | 3.000 | 50.833 | 902.000 | 7.487 | 0 | 15 |
| llama3.1:8b | schema | 15/24 | 3.000 | 50.833 | 902.000 | 2.970 | 0 | 15 |
| llama3.1:8b | egar | 21/24 | 3.375 | 55.708 | 1068.167 | 3.240 | 6 | 15 |
| llama3.1:8b | generic_egar | 17/24 | 3.375 | 58.250 | 1067.042 | 3.372 | 2 | 15 |

## Failures and termination
- gemma3:4b / direct: failures {'repair_budget': 24}; termination {'repair_budget': 24}; validation {'Response must be exactly one valid JSON object.': 24}; model-load seconds 127.120.
- gemma3:4b / schema: failures {'repair_budget': 24}; termination {'repair_budget': 24}; validation {'Response must be exactly one valid JSON object.': 48}; model-load seconds 12.049.
- gemma3:4b / egar: failures {'repair_budget': 24}; termination {'repair_budget': 24}; validation {'Response must be exactly one valid JSON object.': 48}; model-load seconds 11.873.
- gemma3:4b / generic_egar: failures {'repair_budget': 24}; termination {'repair_budget': 24}; validation {'Response must be exactly one valid JSON object.': 48}; model-load seconds 11.827.
- llama3.1:8b / direct: failures {'incorrect_answer': 9}; termination {'terminal_answer': 24}; validation {}; model-load seconds 117.379.
- llama3.1:8b / schema: failures {'incorrect_answer': 9}; termination {'terminal_answer': 24}; validation {}; model-load seconds 8.823.
- llama3.1:8b / egar: failures {'repair_budget': 3}; termination {'terminal_answer': 15, 'repair_budget': 3, 'terminal_abstain': 6}; validation {'Precondition: cited record must match BOTH requested service and region.': 9, 'Precondition: abstention requires no exact service AND region match in the catalogue.': 3}; model-load seconds 9.998.
- llama3.1:8b / generic_egar: failures {'repair_budget': 7}; termination {'terminal_answer': 15, 'repair_budget': 7, 'terminal_abstain': 2}; validation {'Precondition: cited record must match BOTH requested service and region.': 14, 'Precondition: abstention requires no exact service AND region match in the catalogue.': 2}; model-load seconds 10.311.

## Paired contrasts
- gemma3:4b: egar minus direct, difference +0.0000, descriptive bootstrap 95% interval [0.0, 0.0], paired n=24, wins/losses/ties 0/0/24.
- gemma3:4b: egar minus schema, difference +0.0000, descriptive bootstrap 95% interval [0.0, 0.0], paired n=24, wins/losses/ties 0/0/24.
- gemma3:4b: egar minus generic_egar, difference +0.0000, descriptive bootstrap 95% interval [0.0, 0.0], paired n=24, wins/losses/ties 0/0/24.
- llama3.1:8b: egar minus direct, difference +0.2500, descriptive bootstrap 95% interval [0.08333333333333333, 0.4166666666666667], paired n=24, wins/losses/ties 6/0/18.
- llama3.1:8b: egar minus schema, difference +0.2500, descriptive bootstrap 95% interval [0.08333333333333333, 0.4166666666666667], paired n=24, wins/losses/ties 6/0/18.
- llama3.1:8b: egar minus generic_egar, difference +0.1667, descriptive bootstrap 95% interval [0.041666666666666664, 0.3333333333333333], paired n=24, wins/losses/ties 4/0/20.

## Observed conclusion
Gemma3 failed every episode at strict JSON parsing, commonly wrapping proposals in Markdown fences despite the no-markdown instruction. This is an interface-compatibility failure, not evidence of inability to solve the underlying lookup tasks. No permissive-parser rerun was performed because the protocol was frozen.
Llama3.1 EGAR improved from 15/24 to 21/24 versus direct/schema; all six additional successes were missing-record abstentions. Answerable-task success stayed 15/18 in all arms. generic_egar recovered two missing cases. Therefore the measured improvement is narrowly an abstention-repair effect, not improved answerable lookup accuracy. Missingness is confounded with the port field and must be disclosed.

## Interpretation and protocol details
Prompt tokens are Ollama prompt_eval_count, not a model-independent tokenizer estimate. Latency includes local HTTP and model load; elapsed time is estimated from episode start timestamps plus measured successful-call durations, so tiny logging overhead is omitted.
Budget is four action steps with one within-step repair except direct. Thus direct has a four-call ceiling; schema, EGAR and generic_egar have an eight-call ceiling. Rejected proposals consume calls. This is not a freely pooled total budget B. generic_egar is an equal-maximum-budget feedback ablation sharing the EGAR gate, not an ungated equal-budget retry baseline. All arms receive ordinary read-tool errors.
Answer acceptance requires a successful cited read, exact service/region match in the observed catalogue, and verbatim equality to the requested field in that read. This is deployable public-observation copying/provenance validation, not an oracle: private gold is used only by the separate evaluator. Abstain is accepted only after a catalogue list proves no exact match. Controls are scored on exact terminal values without requiring citation correctness.
Any all-success ceiling or zero paired difference is a negative discrimination result: it cannot establish superiority or equivalence. Degenerate bootstrap intervals reflect this finite sample, not certainty about future tasks. The synthetic families are narrow, and the port field occurs only in missing-record cases, confounding requested-field identity with missingness.
No claim of global novelty is made. CRITIC and RubricRefine are relevant prior art for feedback repair and pre-execution provenance/contract validation; see the parent literature review. Frozen experiments were not changed in response to later literature findings.
