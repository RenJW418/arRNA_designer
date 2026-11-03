#!/usr/bin/env python3
"""Capture current local source identity; never build, deploy or infer provenance."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

EXCLUDED_DIRS = {'.git', 'node_modules', '.venv', 'venv', 'env', '__pycache__', '.cache', 'cache', 'caches', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.next', '.vite', 'dist', 'build', 'coverage', '.coverage', '.tox', '.npm', '.pnpm-store', '.yarn', '.idea', '.DS_Store', 'tmp', 'temp', 'results'}
PRIVATE_SUFFIXES = {'.pem', '.key', '.p12', '.pfx', '.keystore'}
LIMITS = [
    'Working-tree identity of included Git tracked and nonignored untracked regular files only; excluded files and file permissions are outside the content hash.',
    'Artifact bytes are observed_artifact only: no demonstrated source-to-build provenance, successful Docker build or deployed identity.',
    'Local inspected images are not proof of deployment, provenance, signature verification or availability on the release host.',
    'No domain, DNS, trusted TLS, public browser acceptance, operational privacy policy or biological performance is verified by this record.',
]

def excluded(path):
    parts = Path(path).parts
    name = parts[-1].lower()
    if any(p.lower() in EXCLUDED_DIRS for p in parts):
        return True
    # Credential-free templates only; real env files are excluded even if tracked.
    if (name == '.env' or name.startswith('.env.') or name.endswith('.env') or '.env.' in name) and not name.endswith('.env.example'):
        return True
    if name == '.envrc' or name.startswith('.envrc.') or name.endswith('.envrc') or '.envrc.' in name:
        return True
    if Path(name).suffix in PRIVATE_SUFFIXES | {'.log', '.pyc', '.pyo', '.tsbuildinfo'}:
        return True
    if name in {'credentials', 'credentials.json', 'secrets.json', 'secrets.yaml', 'secrets.yml', '.netrc', '.npmrc', '.pypirc', '.yarnrc', '.yarnrc.yml', '.ds_store'}:
        return True
    return any(p.lower() in {'secrets', 'credentials', '.ssh', '.aws', '.kube'} for p in parts)

def git(root, *args, optional=False):
    result = subprocess.run(['git', '-C', str(root), *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        if optional:
            return None
        raise RuntimeError('Git query failed: ' + ' '.join(args))
    return result.stdout

def safe_regular(root, relative):
    path = root / relative
    # Refuse all links, including symlinked parent directories. Do not open targets.
    cursor = path
    while cursor != root:
        if cursor.is_symlink():
            return False
        cursor = cursor.parent
    return path.is_file() and path.resolve().is_relative_to(root)

def file_record(root, relative):
    data = (root / relative).read_bytes()
    return {'path': relative, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

def content_hash(files):
    # Unambiguous UTF-8 JSON encoding of the sorted path/size/content-digest list.
    return hashlib.sha256(json.dumps(files, sort_keys=True, ensure_ascii=True, separators=(',', ':')).encode('utf-8')).hexdigest()

def inspect_image(reference):
    if not reference or reference.startswith('-'):
        raise ValueError('Image reference must be a nonempty local reference, not an option')
    try:
        result = subprocess.run(['docker', 'image', 'inspect', reference], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        images = json.loads(result.stdout)
        if len(images) != 1 or not images[0].get('Id') or not images[0].get('Architecture'):
            raise ValueError('Incomplete inspection')
        image = images[0]
        return {'reference': reference, 'id': image['Id'], 'repo_digests': image.get('RepoDigests') or [], 'architecture': image['Architecture']}
    except (OSError, subprocess.CalledProcessError, ValueError, KeyError, TypeError) as exc:
        raise RuntimeError('Local image inspection failed; no release record written') from exc

def capture(root, dist=None, images=()):
    root = Path(root).resolve()
    top = git(root, 'rev-parse', '--show-toplevel').decode().strip()
    if Path(top).resolve() != root:
        raise ValueError('Website directory must be the Git working-tree root')
    candidates = sorted(set(os.fsdecode(p) for p in git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').split(b'\0') if p))
    files, excluded_count, unavailable_count = [], 0, 0
    for relative in candidates:
        if excluded(relative):
            excluded_count += 1
        elif safe_regular(root, relative):
            files.append(file_record(root, relative))
        else:
            unavailable_count += 1
    status = git(root, 'status', '--porcelain=v1', '-z')
    head = git(root, 'rev-parse', '--verify', 'HEAD', optional=True)
    branch = git(root, 'symbolic-ref', '--short', '-q', 'HEAD', optional=True)
    record = {
        'schema_version': 1,
        'captured_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'git': {'head': head.decode().strip() if head else None, 'branch': branch.decode().strip() if branch else None, 'working_tree_dirty': bool(status)},
        'source': {'selection': 'Git tracked plus nonignored untracked; explicit private/dependency/cache/build exclusions; all symlinks excluded', 'hash_encoding': 'SHA256 of ASCII canonical JSON sorted path/bytes/sha256 list', 'file_count': len(files), 'excluded_count': excluded_count, 'unavailable_or_symlink_count': unavailable_count, 'content_sha256': content_hash(files), 'files': files},
        'artifact': None,
        'images': [],
        'verification_limits': LIMITS,
    }
    if dist:
        directory = root / dist
        if not directory.resolve().is_relative_to(root) or directory.is_symlink() or not directory.is_dir():
            raise ValueError('dist must be an existing nonsymlink directory inside website')
        entries = []
        for path in sorted(directory.rglob('*')):
            relative = path.relative_to(root).as_posix()
            # Dist itself is allowed; private/cache subdirectories remain excluded.
            artifact_relative = path.relative_to(directory).as_posix()
            if safe_regular(root, relative) and not excluded(artifact_relative):
                entries.append(file_record(root, relative))
        record['artifact'] = {'status': 'observed_artifact', 'directory': directory.relative_to(root).as_posix(), 'file_count': len(entries), 'content_sha256': content_hash(entries), 'files': entries}
    record['images'] = [inspect_image(reference) for reference in images]
    return record

def validate_output(root, output):
    path = Path(output).absolute()
    if path.resolve().is_relative_to(Path(root).resolve()):
        raise ValueError('Output must be outside website, including symlink aliases')
    if path.exists() or path.is_symlink():
        raise FileExistsError('Refusing to overwrite an existing release record')
    if not path.parent.is_dir():
        raise ValueError('Output parent directory must already exist')
    return path

def write_record(root, output, record):
    path = validate_output(root, output)
    # Exclusive creation prevents overwriting a file created after validation.
    with path.open('x', encoding='utf-8') as stream:
        json.dump(record, stream, ensure_ascii=True, indent=2)
        stream.write('\n')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--dist')
    parser.add_argument('--image', action='append', default=[])
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    try:
        validate_output(root, args.out)
        record = capture(root, args.dist, args.image)
        write_record(root, args.out, record)
    except (ValueError, OSError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print('Captured {} source files: {}'.format(record['source']['file_count'], record['source']['content_sha256']))
    return 0

if __name__ == '__main__':
    sys.exit(main())
