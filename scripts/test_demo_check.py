#!/usr/bin/env python3
"""Exercise the public demo checker through its CLI, using temporary mutations."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/generate_demo.py'
DEMO = ROOT / 'website/dist/demo-data.json'


class DemoCheckTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = json.loads(DEMO.read_bytes())

    def check(self, data):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'demo.json'
            payload = json.dumps(data, ensure_ascii=False).encode()
            path.write_bytes(payload)
            result = subprocess.run([sys.executable, str(SCRIPT), '--check', '--output', str(path)],
                                    capture_output=True, text=True)
            self.assertEqual(path.read_bytes(), payload, 'Check mode must never rewrite its input')
            return result, payload

    def reject(self, mutate, location):
        data = copy.deepcopy(self.original)
        mutate(data)
        result, _ = self.check(data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(location, result.stderr)

    def test_original_and_reformatted_json(self):
        result = subprocess.run([sys.executable, str(SCRIPT), '--check'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['sha256'], hashlib.sha256(DEMO.read_bytes()).hexdigest())
        result, payload = self.check(self.original)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['sha256'], hashlib.sha256(payload).hexdigest())

    def test_tiny_float_drift_is_reported(self):
        data = copy.deepcopy(self.original)
        data['frames'][0]['equity'] += 1e-14
        result, payload = self.check(data)
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertGreaterEqual(report['float_differences'], 1)
        self.assertGreater(report['max_abs_difference'], 0)
        self.assertLessEqual(report['max_abs_difference'], 1e-10)
        self.assertEqual(report['sha256'], hashlib.sha256(payload).hexdigest())

    def test_visible_numeric_change_is_rejected(self):
        self.reject(lambda d: d['frames'][0].__setitem__('equity', d['frames'][0]['equity'] + .01),
                    '$["frames"][0]["equity"]')

    def test_discrete_values_and_list_order_are_exact(self):
        mutations = [
            (lambda d: d['frames'][0].__setitem__('decisionDate', '2000-01-04'), '$["frames"][0]["decisionDate"]'),
            (lambda d: d.__setitem__('activationScale', d['activationScale'] + 1), '$["activationScale"]'),
            (lambda d: d['symbols'].reverse(), '$["symbols"][0]["symbol"]'),
        ]
        for mutation, location in mutations:
            with self.subTest(location=location):
                self.reject(mutation, location)

    def test_boolean_and_numeric_types_are_distinct(self):
        for key, value in [('synthetic', 1), ('activationScale', True), ('activationScale', 255.0),
                           ('initialCapital', 100)]:
            with self.subTest(key=key, value=value):
                self.reject(lambda d: d.__setitem__(key, value), '$["' + key + '"]')

    def test_nonfinite_values_are_rejected(self):
        for value in (float('nan'), float('inf'), -float('inf')):
            with self.subTest(value=value):
                self.reject(lambda d: d['frames'][0].__setitem__('equity', value), '$["frames"][0]["equity"]')

    def test_missing_extra_keys_and_list_length_are_rejected(self):
        mutations = [
            (lambda d: d['frames'][0].pop('equity'), '$["frames"][0]'),
            (lambda d: d['frames'][0].__setitem__('unexpected', 0), '$["frames"][0]'),
            (lambda d: d['frames'].pop(), '$["frames"]'),
        ]
        for mutation, location in mutations:
            with self.subTest(location=location):
                self.reject(mutation, location)


if __name__ == '__main__':
    unittest.main()
