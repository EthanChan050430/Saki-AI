"""Isolated read-only EGAR research prototype; Python standard library only."""
import argparse
import copy
import hashlib
import json
import random
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONDITIONS = ['direct', 'schema', 'egar', 'generic_egar']
PROTOCOL = {
    'version': 1, 'seed': 731904, 'tasks': 24,
    'models': ['gemma3:4b', 'llama3.1:8b'], 'conditions': CONDITIONS,
    'max_steps': 4, 'max_repairs_per_step': 1, 'timeout_seconds': 240,
    'options': {'temperature': 0, 'seed': 731904, 'num_ctx': 4096, 'num_predict': 192},
    'primary': 'exact terminal answer or correct missing-record abstention',
    'contrast': 'egar minus direct; schema and generic_egar are ablations',
    'uncertainty': 'paired task bootstrap, 10000 resamples, seed 104729; descriptive only',
    'order': 'group by model; rotate condition order by task index',
    'failure_policy': 'HTTP errors terminate episode and count as failure; no automatic network retries',
    'scope': 'synthetic held-out instances, not held-out task families; no model-based tuning',
}
SYSTEM = '''You operate a read-only deployment catalogue. Complete the user request using tools, never guess identifiers or values. Each response MUST be exactly one JSON object, with no markdown or commentary.
Allowed action shapes (all and only the listed fields are required):
{"action":"list"}
{"action":"read","record_id":"string"}
{"action":"answer","value":"string","evidence_id":"string"}
{"action":"abstain","reason":"missing_record"}
list returns all catalogue entries. read returns the fields of one entry. Match BOTH service and region exactly. To answer, copy the requested field from a matching record you have read and cite its record_id as evidence_id. If the catalogue contains no matching record, abstain with reason missing_record. Do not abstain before listing. All values must be strings. You have at most four action steps.'''


def encode(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def benchmark(seed=731904, count=24):
    rng = random.Random(seed)
    tasks = []
    for i in range(count):
        service = rng.choice(['billing', 'search', 'metrics', 'gateway'])
        region = rng.choice(['eu-west', 'us-east', 'ap-south'])
        field = ['release', 'checksum', 'owner', 'port'][i % 4]
        missing = i % 4 == 3
        records = []
        pairs = [(service, region + '-backup'), (service + '-legacy', region)]
        if not missing:
            pairs.append((service, region))
        pairs.append(('archive-' + service, 'offline'))
        for s, r in pairs:
            records.append({'record_id': 'rec-' + format(rng.getrandbits(40), '010x'),
                            'service': s, 'region': r,
                            'fields': {'release': 'v' + str(rng.randrange(10000, 99999)),
                                       'checksum': format(rng.getrandbits(64), '016x'),
                                       'owner': 'team-' + format(rng.getrandbits(32), '08x'),
                                       'port': str(rng.randrange(1024, 65535))}})
        rng.shuffle(records)
        matching = next((r for r in records if r['service'] == service and r['region'] == region), None)
        tasks.append({'id': f'task-{i:03}', 'request': {'service': service, 'region': region, 'field': field},
                      'records': records, 'gold': None if missing else matching['fields'][field]})
    return tasks


def public_request(task):
    q = task['request']
    return f"Find {q['field']} for service {q['service']} in region {q['region']}."


def schema_error(action):
    if not isinstance(action, dict):
        return 'Expected a JSON object.'
    shapes = {'list': {'action'}, 'read': {'action', 'record_id'},
              'answer': {'action', 'value', 'evidence_id'}, 'abstain': {'action', 'reason'}}
    name = action.get('action')
    if not isinstance(name, str) or name not in shapes:
        return 'Unknown action; use list, read, answer, or abstain.'
    if set(action) != shapes[name] or any(not isinstance(v, str) for v in action.values()):
        return f'Wrong fields or types for {name}; follow the exact action shape.'
    if name == 'abstain' and action['reason'] != 'missing_record':
        return 'abstain.reason must be missing_record.'
    return None


def evidence_error(action, request, observations):
    """This validator only receives the public request and actual tool observations."""
    error = schema_error(action)
    if error:
        return error
    listed = [o['entries'] for o in observations if o.get('tool') == 'list']
    entries = listed[-1] if listed else []
    matching = [e for e in entries if e['service'] == request['service'] and e['region'] == request['region']]
    name = action['action']
    if name == 'list':
        return None
    if not listed:
        return 'Precondition: list the catalogue first.'
    if name == 'read':
        if action['record_id'] not in [e['record_id'] for e in entries]:
            return 'Precondition: record_id must occur in a list observation.'
    elif name == 'abstain':
        if matching:
            return 'Precondition: abstention requires no exact service AND region match in the catalogue.'
    elif name == 'answer':
        reads = [o for o in observations if o.get('tool') == 'read' and o.get('record_id') == action['evidence_id'] and 'fields' in o]
        if not reads:
            return 'Precondition: evidence_id must cite a successful read observation.'
        if action['evidence_id'] not in [e['record_id'] for e in matching]:
            return 'Precondition: cited record must match BOTH requested service and region.'
        if reads[-1]['fields'].get(request['field']) != action['value']:
            return 'Precondition: value must exactly copy the requested field from the cited read observation.'
    return None


def execute(action, task):
    """Allowlisted in-memory read-only tools; malformed actions cannot execute."""
    error = schema_error(action)
    if error:
        raise ValueError(error)
    if action['action'] == 'list':
        return {'tool': 'list', 'entries': [{k: r[k] for k in ('record_id', 'service', 'region')} for r in task['records']]}
    if action['action'] == 'read':
        record = next((r for r in task['records'] if r['record_id'] == action['record_id']), None)
        if record is None:
            return {'tool': 'read', 'error': 'unknown record_id'}
        return {'tool': 'read', **copy.deepcopy(record)}
    raise ValueError('Terminal proposals are not executable tools')


def evaluate(task, terminal):
    if schema_error(terminal):
        return False
    if task['gold'] is None:
        return terminal['action'] == 'abstain'
    return terminal['action'] == 'answer' and terminal['value'] == task['gold']


def append_log(path, event):
    with path.open('a', encoding='utf-8') as out:
        out.write(encode(event) + '\n')
        out.flush()


def ollama(model, messages):
    payload = {'model': model, 'messages': messages, 'stream': False, 'keep_alive': '30m',
               'options': PROTOCOL['options']}
    req = urllib.request.Request('http://localhost:11434/api/chat', data=encode(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    start = time.perf_counter()
    with urllib.request.urlopen(req, timeout=PROTOCOL['timeout_seconds']) as response:
        body = json.load(response)
    return body, time.perf_counter() - start


def episode(task, model, condition, log, generate=ollama):
    messages = [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': public_request(task)}]
    observations, terminal = [], None
    calls = 0
    errors = 0
    termination = 'step_budget'
    latencies = 0.0
    tokens = 0
    key = {'task_id': task['id'], 'model': model, 'condition': condition}
    attempt_id = time.time_ns()
    base = {**key, 'attempt_id': attempt_id}
    append_log(log, {**base, 'event': 'start'})
    for step in range(PROTOCOL['max_steps']):
        accepted = None
        for repair in range(1 if condition == 'direct' else 2):
            calls += 1
            call_meta = {**base, 'step': step, 'repair': repair, 'call': calls}
            append_log(log, {**call_meta, 'event': 'request', 'messages': copy.deepcopy(messages),
                             'options': PROTOCOL['options']})
            start = time.perf_counter()
            try:
                body, latency = generate(model, copy.deepcopy(messages))
            except Exception as exc:
                append_log(log, {**call_meta, 'event': 'network_error', 'error': str(exc),
                                 'latency_seconds': time.perf_counter() - start})
                result = {**base, 'event': 'outcome', 'success': False, 'terminal': None,
                          'calls': calls, 'validation_errors': errors, 'latency_seconds': latencies,
                          'output_tokens': tokens, 'failure': 'transport'}
                append_log(log, result)
                return result
            latencies += latency
            tokens += body.get('eval_count', 0)
            raw = body.get('message', {}).get('content', '')
            try:
                action = json.loads(raw)
                error = schema_error(action)
            except (ValueError, TypeError):
                action, error = None, 'Response must be exactly one valid JSON object.'
            if error is None and condition in ('egar', 'generic_egar'):
                error = evidence_error(action, task['request'], observations)
            append_log(log, {**call_meta, 'event': 'response', 'raw': raw, 'action': action,
                             'validation_error': error, 'latency_seconds': latency, 'ollama': body})
            messages.append({'role': 'assistant', 'content': raw})
            if error is None:
                accepted = action
                break
            errors += 1
            feedback = ('Action rejected. Reconsider your response and follow the original instructions.'
                        if condition == 'generic_egar' else 'Action rejected: ' + error)
            messages.append({'role': 'user', 'content': feedback})
        if accepted is None:
            termination = 'repair_budget'
            break
        if accepted['action'] in ('answer', 'abstain'):
            terminal = accepted
            termination = 'terminal_' + accepted['action']
            break
        observation = execute(accepted, task)
        observations.append(observation)
        append_log(log, {**base, 'event': 'observation', 'step': step, 'action': accepted, 'observation': observation})
        messages.append({'role': 'user', 'content': 'Tool observation: ' + encode(observation)})
    result = {**base, 'event': 'outcome', 'success': evaluate(task, terminal), 'terminal': terminal,
              'calls': calls, 'validation_errors': errors, 'latency_seconds': latencies,
              'output_tokens': tokens, 'termination': termination, 'max_calls': 4 if condition == 'direct' else 8,
              'failure': None if evaluate(task, terminal) else 'task'}
    append_log(log, result)
    return result


def freeze():
    files = {'benchmark.json': encode(benchmark()), 'protocol.json': encode(PROTOCOL)}
    for name, text in files.items():
        path = ROOT / name
        if path.exists() and path.read_text(encoding='utf-8') != text:
            raise RuntimeError('Refusing to replace frozen ' + name)
        path.write_text(text, encoding='utf-8')
    names = ['benchmark.json', 'protocol.json', 'experiment.py', 'test_experiment.py']
    manifest = {name: digest((ROOT / name).read_bytes()) for name in names}
    path = ROOT / 'freeze-manifest.json'
    if path.exists() and json.loads(path.read_text()) != manifest:
        raise RuntimeError('Freeze mismatch; do not silently alter the protocol or implementation')
    path.write_text(encode(manifest), encoding='utf-8')
    print(encode(manifest), flush=True)


def check_freeze():
    manifest = json.loads((ROOT / 'freeze-manifest.json').read_text())
    for name, expected in manifest.items():
        if digest((ROOT / name).read_bytes()) != expected:
            raise RuntimeError('Frozen file changed: ' + name)


def read_events(path):
    if not path.exists():
        return []
    events = []
    lines = path.read_text(encoding='utf-8').splitlines()
    for index, line in enumerate(lines):
        try:
            events.append(json.loads(line))
        except ValueError:
            if index != len(lines) - 1:
                raise
            raise RuntimeError('Truncated final JSONL line; preserve it and repair explicitly before resuming')
    return events


def run():
    check_freeze()
    log = ROOT / 'results.jsonl'
    done = {(e['model'], e['task_id'], e['condition']) for e in read_events(log) if e['event'] == 'outcome'}
    tasks = json.loads((ROOT / 'benchmark.json').read_text(encoding='utf-8'))
    if not (ROOT / 'environment.json').exists():
        env = {}
        for endpoint in ['version', 'tags']:
            with urllib.request.urlopen('http://localhost:11434/api/' + endpoint, timeout=30) as response:
                env[endpoint] = json.load(response)
        env['started_unix'] = time.time()
        env['freeze_manifest_sha256'] = digest((ROOT / 'freeze-manifest.json').read_bytes())
        (ROOT / 'environment.json').write_text(encode(env), encoding='utf-8')
    for model in PROTOCOL['models']:
        for i, task in enumerate(tasks):
            order = CONDITIONS[i % 4:] + CONDITIONS[:i % 4]
            for condition in order:
                if (model, task['id'], condition) in done:
                    continue
                result = episode(task, model, condition, log)
                print(encode(result), flush=True)
    summarize()


def summarize():
    rows = [e for e in read_events(ROOT / 'results.jsonl') if e['event'] == 'outcome']
    groups, contrasts = [], []
    rng = random.Random(104729)
    for model in PROTOCOL['models']:
        for condition in CONDITIONS:
            selected = [r for r in rows if r['model'] == model and r['condition'] == condition]
            n = len(selected)
            groups.append({'model': model, 'condition': condition, 'n': n,
                           'successes': sum(r['success'] for r in selected),
                           'success_rate': sum(r['success'] for r in selected) / n if n else None,
                           'calls': sum(r['calls'] for r in selected),
                           'output_tokens': sum(r['output_tokens'] for r in selected),
                           'latency_seconds': sum(r['latency_seconds'] for r in selected),
                           'validation_errors': sum(r['validation_errors'] for r in selected),
                           'transport_failures': sum(r['failure'] == 'transport' for r in selected)})
        egar = {r['task_id']: r for r in rows if r['model'] == model and r['condition'] == 'egar'}
        for control in ['direct', 'schema', 'generic_egar']:
            baseline = {r['task_id']: r for r in rows if r['model'] == model and r['condition'] == control}
            ids = sorted(set(egar) & set(baseline))
            diffs = [int(egar[i]['success']) - int(baseline[i]['success']) for i in ids]
            if not diffs:
                continue
            n = len(diffs)
            draws = sorted(sum(rng.choices(diffs, k=n)) / n for _ in range(10000))
            contrasts.append({'model': model, 'contrast': 'egar minus ' + control, 'paired_n': n,
                              'difference': sum(diffs) / n, 'bootstrap_95_percent': [draws[249], draws[9749]],
                              'wins': diffs.count(1), 'losses': diffs.count(-1), 'ties': diffs.count(0)})
    summary = {'groups': groups, 'paired_contrasts': contrasts, 'completed_episodes': len(rows),
               'expected_episodes': 192, 'manifest': json.loads((ROOT / 'freeze-manifest.json').read_text())}
    (ROOT / 'aggregate.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    lines = ['# EGAR experiment report', '',
             'Isolated Python prototype; not integrated into Saki production tools. The existing agentTools.js registry was inspected but not reused: it exposes filesystem/network/terminal tools inappropriate for an isolated read-only experiment.', '',
             '## Frozen protocol',
             '24 seeded held-out instances per model, four conditions, maximum four action steps. Direct permits one proposal per step; schema permits one repair on schema failure; EGAR permits one repair on schema or public-evidence failure. generic_egar uses the identical gate and maximum budget but generic rejection feedback. This is an equal maximum-budget diagnostic-feedback ablation, not equal realized token expenditure.',
             'All conditions receive identical initial instructions and strict JSON parsing without constrained decoding. Requests use temperature 0, context 4096, output cap 192, sequential local Ollama HTTP with 240-second timeout. Six missing-record cases per model; eighteen answerable. Condition order rotates within task; models run in groups. No evaluation values are passed to prompt construction or evidence validation.', '',
             '## Actual outcomes', f'Completed episodes: {len(rows)} / 192.', '',
             '| Model | Condition | Correct / n | Calls | Output tokens | Seconds | Validation errors | Transport failures |',
             '|---|---|---:|---:|---:|---:|---:|---:|']
    for g in groups:
        lines.append(f"| {g['model']} | {g['condition']} | {g['successes']}/{g['n']} | {g['calls']} | {g['output_tokens']} | {g['latency_seconds']:.1f} | {g['validation_errors']} | {g['transport_failures']} |")
    lines += ['', '## Paired comparisons', 'Differences are proportions (EGAR minus control); percentile paired task bootstrap, 10,000 resamples.']
    for c in contrasts:
        lines.append(f"- {c['model']}, {c['contrast']}: {c['difference']:+.3f}, descriptive 95% interval {c['bootstrap_95_percent']}; n={c['paired_n']}, wins/losses/ties={c['wins']}/{c['losses']}/{c['ties']}.")
    lines += ['', '## Reproduction', '```powershell', 'Set-Location D:\\Saki-AI\\research\\small-model-agent', 'python -m unittest -v test_experiment.py', 'python experiment.py freeze', 'python experiment.py run', 'python experiment.py summarize', '```', '',
              'Results append to results.jsonl; completed episode keys are skipped on resume. A crash before outcome reruns that episode with a new attempt_id; partial attempts remain auditable. Freeze hashes cover benchmark, protocol, implementation and tests; run refuses a changed file. environment.json records Ollama version and model digests. Each request, raw response, parsed action, validation error, executed observation, usage, latency and outcome is retained.', '',
              '## Limitations',
              'Synthetic catalogue lookup with distractors is narrow and contains repeated task families, not independent real-world tasks. No training or prompt tuning was performed on these held-out instances. Exact-value scoring does not itself require valid citation in controls; EGAR enforces citation and copying at runtime. Semantic failures in controls are intentional ablations; malformed proposals never execute, and all executable tools are allowlisted in-memory reads. Shared deterministic seeds do not guarantee bitwise GPU reproducibility. Temperature-zero single trials omit sampling variability. Bootstrap intervals are descriptive and unadjusted for multiple comparisons; small n and related tasks limit inference. Gate overhead and cold-load cost are included in wall latency but no randomized model-order crossover is performed. Transport failures count as failures; their latency is in network_error events, not successful-call latency totals. No large-model parity or global novelty claim is supported.']
    (ROOT / 'experiment-report.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(encode(summary), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['freeze', 'run', 'summarize'])
    args = parser.parse_args()
    {'freeze': freeze, 'run': run, 'summarize': summarize}[args.command]()
