"""Post-run descriptive analysis; never used to change frozen inference."""
import collections
import json
from pathlib import Path
import experiment as e

root = Path(__file__).resolve().parent
events = e.read_events(root / 'results.jsonl')
rows = [r for r in events if r['event'] == 'outcome']
responses = [r for r in events if r['event'] == 'response']
summary = json.loads((root / 'aggregate.json').read_text())
groups = []
for g in summary['groups']:
    subset = [r for r in rows if r['model'] == g['model'] and r['condition'] == g['condition']]
    calls = [r for r in responses if r['model'] == g['model'] and r['condition'] == g['condition']]
    n = len(subset)
    failures = collections.Counter()
    for r in subset:
        if r['success']:
            continue
        if r['failure'] == 'transport':
            category = 'transport'
        elif r['terminal'] is None:
            category = r['termination']
        elif r['terminal']['action'] == 'abstain':
            category = 'incorrect_abstention'
        else:
            category = 'incorrect_answer'
        failures[category] += 1
    groups.append({**g, 'mean_calls': g['calls'] / n,
                   'mean_output_tokens': g['output_tokens'] / n,
                   'mean_prompt_tokens': sum(r['ollama'].get('prompt_eval_count', 0) for r in calls) / n,
                   'mean_latency_seconds': g['latency_seconds'] / n,
                   'load_seconds': sum(r['ollama'].get('load_duration', 0) for r in calls) / 1e9,
                   'failure_categories': dict(failures),
                   'termination_counts': dict(collections.Counter(r['termination'] for r in subset)),
                   'validation_categories': dict(collections.Counter(r['validation_error'] for r in calls if r['validation_error'])),
                   'missing_successes': sum(r['success'] for r in subset if int(r['task_id'].split('-')[1]) % 4 == 3),
                   'answerable_successes': sum(r['success'] for r in subset if int(r['task_id'].split('-')[1]) % 4 != 3)})
first = min(r['attempt_id'] for r in rows) / 1e9
last = max(r['attempt_id'] / 1e9 + r['latency_seconds'] for r in rows)
detail = {'groups': groups, 'paired_contrasts': summary['paired_contrasts'],
          'completed_episodes': len(rows), 'response_count': len(responses),
          'elapsed_seconds_estimate': last - first,
          'successful_call_latency_seconds': sum(r['latency_seconds'] for r in rows),
          'total_output_tokens': sum(r['output_tokens'] for r in rows),
          'total_prompt_tokens': sum(r['ollama'].get('prompt_eval_count', 0) for r in responses)}
(root / 'detailed-aggregate.json').write_text(json.dumps(detail, indent=2), encoding='utf-8')
lines = ['# Detailed measured results', '',
         f"Episodes: {len(rows)}/192; responses: {len(responses)}; approximate elapsed seconds: {last-first:.2f}.",
         f"Total output tokens: {detail['total_output_tokens']}; prompt-evaluation tokens: {detail['total_prompt_tokens']}.", '',
         '| Model | Arm | Success/n | Mean calls | Mean output tokens | Mean prompt tokens | Mean seconds | Missing /6 | Answerable /18 |',
         '|---|---|---:|---:|---:|---:|---:|---:|---:|']
for g in groups:
    lines.append(f"| {g['model']} | {g['condition']} | {g['successes']}/{g['n']} | {g['mean_calls']:.3f} | {g['mean_output_tokens']:.3f} | {g['mean_prompt_tokens']:.3f} | {g['mean_latency_seconds']:.3f} | {g['missing_successes']} | {g['answerable_successes']} |")
lines += ['', '## Failures and termination']
for g in groups:
    lines.append(f"- {g['model']} / {g['condition']}: failures {g['failure_categories']}; termination {g['termination_counts']}; validation {g['validation_categories']}; model-load seconds {g['load_seconds']:.3f}.")
lines += ['', '## Paired contrasts']
for c in summary['paired_contrasts']:
    lines.append(f"- {c['model']}: {c['contrast']}, difference {c['difference']:+.4f}, descriptive bootstrap 95% interval {c['bootstrap_95_percent']}, paired n={c['paired_n']}, wins/losses/ties {c['wins']}/{c['losses']}/{c['ties']}.")
lines += ['', '## Observed conclusion',
          'Gemma3 failed every episode at strict JSON parsing, commonly wrapping proposals in Markdown fences despite the no-markdown instruction. This is an interface-compatibility failure, not evidence of inability to solve the underlying lookup tasks. No permissive-parser rerun was performed because the protocol was frozen.',
          'Llama3.1 EGAR improved from 15/24 to 21/24 versus direct/schema; all six additional successes were missing-record abstentions. Answerable-task success stayed 15/18 in all arms. generic_egar recovered two missing cases. Therefore the measured improvement is narrowly an abstention-repair effect, not improved answerable lookup accuracy. Missingness is confounded with the port field and must be disclosed.', '', '## Interpretation and protocol details',
          'Prompt tokens are Ollama prompt_eval_count, not a model-independent tokenizer estimate. Latency includes local HTTP and model load; elapsed time is estimated from episode start timestamps plus measured successful-call durations, so tiny logging overhead is omitted.',
          'Budget is four action steps with one within-step repair except direct. Thus direct has a four-call ceiling; schema, EGAR and generic_egar have an eight-call ceiling. Rejected proposals consume calls. This is not a freely pooled total budget B. generic_egar is an equal-maximum-budget feedback ablation sharing the EGAR gate, not an ungated equal-budget retry baseline. All arms receive ordinary read-tool errors.',
          'Answer acceptance requires a successful cited read, exact service/region match in the observed catalogue, and verbatim equality to the requested field in that read. This is deployable public-observation copying/provenance validation, not an oracle: private gold is used only by the separate evaluator. Abstain is accepted only after a catalogue list proves no exact match. Controls are scored on exact terminal values without requiring citation correctness.',
          'Any all-success ceiling or zero paired difference is a negative discrimination result: it cannot establish superiority or equivalence. Degenerate bootstrap intervals reflect this finite sample, not certainty about future tasks. The synthetic families are narrow, and the port field occurs only in missing-record cases, confounding requested-field identity with missingness.',
          'No claim of global novelty is made. CRITIC and RubricRefine are relevant prior art for feedback repair and pre-execution provenance/contract validation; see the parent literature review. Frozen experiments were not changed in response to later literature findings.']
(root / 'results-detail.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(json.dumps(detail, indent=2))
