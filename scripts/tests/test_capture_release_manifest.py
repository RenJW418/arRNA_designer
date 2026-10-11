"""Offline release-record checks using a temporary Git working tree."""
import importlib.util
import json
import pathlib
import subprocess
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'capture_release_manifest.py'

class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = pathlib.Path(self.tmp.name)
        self.root = self.base / 'website'
        self.root.mkdir()
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        spec = importlib.util.spec_from_file_location('capture', SCRIPT)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)

    def put(self, path, content='text'):
        p = self.root / path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)
        return p

    def test_exclusion_hash_and_observed_artifact(self):
        self.put('.gitignore', 'ignored.txt\nfrontend/dist/\n')
        self.put('source.txt', 'abc')
        self.put('new.txt', 'new')
        self.put('README.md', 'ordinary documentation')
        self.put('docs/operator.md', 'ordinary documentation')
        self.put('ignored.txt', 'private')
        for name in ['.env', 'deploy/https/https.env', 'frontend/node_modules/pkg.js', 'backend/.venv/bin/python', 'cache/secret', '.cache/secret', 'key.pem', '.envrc', 'private.envrc', 'private.envrc.local', 'tmp/run.json', 'results/output.json', 'run.log', 'mod.pyc', 'mod.pyo', 'frontend/tsconfig.tsbuildinfo']:
            self.put(name, 'SECRET_DO_NOT_READ')
        self.put('.env.example', 'PUBLIC_TEMPLATE=')
        self.put('frontend/dist/index.html', 'observed')
        subprocess.run(['git', '-C', str(self.root), 'add', '-f', '.gitignore', 'source.txt', 'new.txt', 'README.md', 'docs', '.env', 'deploy', 'frontend', 'backend', 'cache', '.cache', 'key.pem', '.envrc', 'private.envrc', 'private.envrc.local', 'tmp', 'results', 'run.log', 'mod.pyc', 'mod.pyo', 'frontend/tsconfig.tsbuildinfo', '.env.example'], check=True)
        self.put('untracked.txt', 'untracked')
        outside = self.base / 'secret.txt'
        outside.write_text('external secret')
        (self.root / 'external.txt').symlink_to(outside)
        first = self.module.capture(self.root, dist='frontend/dist')
        paths = [f['path'] for f in first['source']['files']]
        self.assertEqual(paths, ['.env.example', '.gitignore', 'README.md', 'docs/operator.md', 'new.txt', 'source.txt', 'untracked.txt'])
        source = next(f for f in first['source']['files'] if f['path'] == 'source.txt')
        self.assertEqual(source['sha256'], 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
        self.assertEqual(first['artifact']['status'], 'observed_artifact')
        self.assertEqual(first['source']['content_sha256'], self.module.capture(self.root)['source']['content_sha256'])
        self.put('source.txt', 'abcd')
        self.assertNotEqual(first['source']['content_sha256'], self.module.capture(self.root)['source']['content_sha256'])
        self.assertNotIn('SECRET_DO_NOT_READ', json.dumps(first))

    def test_output_guards_and_atomic_no_overwrite(self):
        self.put('source.txt')
        record = self.module.capture(self.root)
        with self.assertRaises(ValueError):
            self.module.write_record(self.root, self.root / 'record.json', record)
        alias = self.base / 'alias'
        alias.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(ValueError):
            self.module.write_record(self.root, alias / 'record.json', record)
        out = self.base / 'record.json'
        self.module.write_record(self.root, out, record)
        with self.assertRaises(FileExistsError):
            self.module.write_record(self.root, out, record)
        self.assertEqual(json.loads(out.read_text())['source'], record['source'])

    def test_source_only_does_not_inspect_images(self):
        from unittest.mock import patch
        self.put('source.txt')
        with patch.object(self.module, 'inspect_image', side_effect=AssertionError('Docker called')):
            record = self.module.capture(self.root)
        self.assertEqual(record['images'], [])
        self.assertIsNone(record['artifact'])

    def test_dist_external_symlink_rejected(self):
        outside = self.base / 'dist'
        outside.mkdir()
        self.put('source.txt')
        (self.root / 'dist').symlink_to(outside, target_is_directory=True)
        with self.assertRaises(ValueError):
            self.module.capture(self.root, dist='dist')

    def test_image_inspection_redacts_config_and_fails(self):
        from unittest.mock import patch
        inspected = [{'Id': 'sha256:actual', 'RepoDigests': ['repo@sha256:actual'], 'Architecture': 'arm64', 'Config': {'Env': ['SECRET=private']}}]
        with patch.object(self.module.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, json.dumps(inspected), '')) as run:
            result = self.module.inspect_image('local:retained')
        self.assertEqual(run.call_args.args[0], ['docker', 'image', 'inspect', 'local:retained'])
        self.assertEqual(result, {'reference': 'local:retained', 'id': 'sha256:actual', 'repo_digests': ['repo@sha256:actual'], 'architecture': 'arm64'})
        with patch.object(self.module.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, ['docker'])):
            with self.assertRaises(RuntimeError):
                self.module.inspect_image('missing')

if __name__ == '__main__':
    unittest.main()
