import copy
import json
import unittest
from pathlib import Path
import experiment as e


class ExperimentTests(unittest.TestCase):
    def setUp(self):
        self.task = e.benchmark()[0]

    def test_seed_stability(self):
        self.assertEqual(e.benchmark(), e.benchmark())
        self.assertNotEqual(e.benchmark(), e.benchmark(seed=2))
        self.assertEqual(sum(t['gold'] is None for t in e.benchmark()), 6)
        self.assertEqual(len(e.benchmark()), 24)

    def test_no_gold_or_hidden_values_in_initial_prompt(self):
        prompt = e.SYSTEM + e.public_request(self.task)
        for r in self.task['records']:
            self.assertNotIn(r['record_id'], prompt)
            for value in r['fields'].values():
                self.assertNotIn(value, prompt)
        mutated = copy.deepcopy(self.task)
        mutated['gold'] = 'POISONED_GOLD'
        mutated['records'] = []
        self.assertEqual(e.public_request(mutated), e.public_request(self.task))

    def test_validator_uses_only_public_observations(self):
        obs = [e.execute({'action': 'list'}, self.task)]
        r = next(r for r in self.task['records'] if r['service'] == self.task['request']['service'] and r['region'] == self.task['request']['region'])
        action = {'action': 'answer', 'value': r['fields'][self.task['request']['field']], 'evidence_id': r['record_id']}
        self.assertIsNotNone(e.evidence_error(action, self.task['request'], obs))
        obs.append(e.execute({'action': 'read', 'record_id': r['record_id']}, self.task))
        self.assertIsNone(e.evidence_error(action, self.task['request'], obs))
        # Public-observation mutation must change acceptance even though private gold stays unchanged.
        obs[-1]['fields'][self.task['request']['field']] = 'public-new-value'
        self.assertIsNotNone(e.evidence_error(action, self.task['request'], obs))
        action['value'] = 'public-new-value'
        self.assertIsNone(e.evidence_error(action, self.task['request'], obs))
        self.assertFalse(e.evaluate(self.task, action))

    def test_deterministic_evaluator(self):
        answer = {'action': 'answer', 'value': self.task['gold'], 'evidence_id': 'ignored-by-exact-score'}
        self.assertTrue(e.evaluate(self.task, answer))
        self.assertEqual(e.evaluate(self.task, answer), e.evaluate(copy.deepcopy(self.task), answer))
        self.assertFalse(e.evaluate(self.task, None))
        self.assertTrue(e.evaluate(e.benchmark()[3], {'action': 'abstain', 'reason': 'missing_record'}))

    def test_invalid_tools_cannot_execute(self):
        for action in [None, [], {'action': []}, {'action': 'terminal', 'command': 'anything'}, {'action': 'list', 'extra': 'x'}, {'action': 'read', 'record_id': 12}]:
            with self.assertRaises(ValueError):
                e.execute(action, self.task)
        self.assertIn('error', e.execute({'action': 'read', 'record_id': 'unknown'}, self.task))

    def test_abstain_and_identifier_gates(self):
        abstain = {'action': 'abstain', 'reason': 'missing_record'}
        self.assertIsNotNone(e.evidence_error(abstain, self.task['request'], []))
        self.assertIsNotNone(e.evidence_error(abstain, self.task['request'], [e.execute({'action': 'list'}, self.task)]))
        missing = e.benchmark()[3]
        self.assertIsNone(e.evidence_error(abstain, missing['request'], [e.execute({'action': 'list'}, missing)]))
        self.assertIsNotNone(e.evidence_error({'action': 'read', 'record_id': 'unknown'}, self.task['request'], [e.execute({'action': 'list'}, self.task)]))

    def test_bounded_retries_and_no_rejected_execution(self):
        log = Path(__file__).parent / 'test-events.jsonl'
        def bad(model, messages):
            return {'message': {'content': '{"action":"read","record_id":"unobserved"}'}, 'eval_count': 5}, 0.01
        try:
            result = e.episode(self.task, 'fake', 'egar', log, bad)
            self.assertEqual(result['calls'], 2)
            self.assertEqual(result['termination'], 'repair_budget')
            self.assertFalse(any(x['event'] == 'observation' for x in e.read_events(log)))
        finally:
            log.unlink(missing_ok=True)

    def test_max_steps_and_tool_errors_reach_schema_baseline(self):
        log = Path(__file__).parent / 'test-events.jsonl'
        prompts = []
        def unknown(model, messages):
            prompts.append(copy.deepcopy(messages))
            return {'message': {'content': '{"action":"read","record_id":"unknown"}'}}, 0.01
        try:
            result = e.episode(self.task, 'fake', 'schema', log, unknown)
            self.assertEqual(result['calls'], 4)
            self.assertEqual(result['termination'], 'step_budget')
            self.assertIn('unknown record_id', json.dumps(prompts[1]))
        finally:
            log.unlink(missing_ok=True)


if __name__ == '__main__':
    unittest.main()
