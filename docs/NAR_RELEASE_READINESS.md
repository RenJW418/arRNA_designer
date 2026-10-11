# Local release identity and operator readiness

Prepared 2026-10-07. This document provides a local source record and an operator
checklist. It does not establish deployment, trusted TLS or biological efficacy.
The final public domain has not been supplied. Public acceptance, infrastructure
privacy/retention policy and maintenance commitments remain operator-owned gates.
See [HTTPS preparation](NAR_HTTPS_OPTIONAL.md) and
[website evidence](NAR_WEBSITE_READINESS.md).

## Capture the current working tree

Use Python 3.12+ from the website Git root. Choose a new output filename in an
existing directory **outside** `website/`; existing records are never overwritten.
No Docker command runs unless an image is explicitly requested.

```sh
python3 scripts/capture_release_manifest.py --out /absolute/archive/release-source-NEW.json
# Optional: record existing build bytes without asserting their origin.
python3 scripts/capture_release_manifest.py --out /absolute/archive/release-observed-NEW.json --dist frontend/dist
# Optional: inspect already-present local images; never builds or pulls them.
python3 scripts/capture_release_manifest.py --out /absolute/archive/release-images-NEW.json --image local-retained-backend:release --image local-retained-frontend:release
```

Replace all example paths and image references with actual operator-owned values.
Missing Git context, an invalid output path or failed requested image inspection
causes a nonzero exit without a release record. Output aliases resolving inside
`website/` and existing files/symlinks are rejected. The output directory must
already exist.

The source selection is sorted Git tracked files plus nonignored untracked files
in the current working tree, including dirty source changes. Git HEAD/branch and
dirty status provide context; the deterministic content hash identifies the
included current bytes. It is SHA-256 of the ASCII canonical JSON list of each
sorted path, byte count and file SHA-256. Capture time is outside that hash.
Deleted/nonregular files and all symlinks are skipped and counted. Symlink targets
are never opened. This record does not encode file modes or excluded files.

Explicit exclusions apply even to tracked files: real `.env`/`*.env` variants and `.envrc` variants,
credential/config stores and private key formats, dependency environments,
node_modules, Git internals, caches, temporary/results directories, build/dist/coverage directories and
log/bytecode/TypeScript build-info files. Only
`.env.example` templates are allowed. Operators must keep templates free of real
credentials and review the selected files: no filename-based rule can identify an
arbitrarily named secret embedded in an ordinary source file. Ignored untracked
files are outside the source hash. Never store user-submitted sequences or private
operational configuration in release source records.

`--dist` records regular files of an existing in-tree nonsymlink directory as
`observed_artifact`, applying private/cache exclusions within it. It does **not**
prove source-to-build provenance, a successful Docker build or production content.
`--image` runs only `docker image inspect` with argument-list subprocesses against
each explicit local reference. The retained fields are reference, actual image ID,
repository digests and architecture. Image configuration, environment variables
and raw Docker errors are not retained. A local image ID is not evidence of a
running release, registry availability or signature verification.

## Release and rollback evidence

Before an owner-authorized release, retain the current source manifest, build
logs, observed artifacts and the exact backend/frontend image IDs and repository
digests. Record which retained images actually run on the release host, the
operator-confirmed domain, UTC release time, deployment settings without secrets
and acceptance logs. Preserve the **previous working images/artifacts** and their
manifest before replacing anything; a mutable tag alone is insufficient.

For rollback, use those already-retained previous images/artifacts and their
recorded deployment configuration. Do not rebuild an old checkout and call the
result the original working release: dependencies, base images and build inputs
may have changed. Confirm the retained image identities and availability first,
then follow the operator's reviewed rollback procedure. Repeat same-origin public
health, API, download and browser checks after a rollback. TLS-edge-only rollback
is separately described in `NAR_HTTPS_OPTIONAL.md`; it does not roll back website
content. This task performs none of these production operations.

A complete source-to-build claim needs an independently retained build record
linking the captured source hash to actual outputs/images. A public release claim
also needs real host/image identity and public acceptance at the actual domain.
This helper alone supplies neither. No daemon, container, registry operation,
certificate request or public smoke is required or implied by capture.

## Offline helper verification

```sh
python3 -m unittest discover -s scripts/tests -p 'test_capture_release_manifest.py'
```

Temporary Git fixtures exercise private tracked-file and ignored-file exclusions,
known SHA-256 bytes, deterministic hash changes, external symlink rejection,
output alias/overwrite protections and explicit image-inspection redaction/error
handling. Mocked image inspection is a helper test only; it does not assert that
any real local Docker image has been inspected.
