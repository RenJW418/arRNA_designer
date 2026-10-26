# NAR Release Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare accurate source/build identity and production checks for the website version accompanying the NAR manuscript.

**Architecture:** Keep local forwarded-API tests distinct from same-origin/public verification. Capture a read-only manifest of actual working-tree files, optional built frontend files and explicitly inspected local images. Publication and deployment remain separate operator actions.

**Tech Stack:** Python standard library, Git, existing Playwright smoke tools; optional read-only Docker image inspection.

**Spec:** User's full NAR preparation objective, `docs/NAR_HTTPS_OPTIONAL.md` and `docs/NAR_WEBSITE_READINESS.md`.

## Global Constraints

- NatureProtocol final and original experimental profiles remain unchanged.
- No deployment, push, Docker daemon startup, certificate request or disclosure of private environment files.
- A Git HEAD alone does not identify the current dirty working tree.
- Missing image identity or TLS evidence remains unverified; no invented digest/domain.
- Capturing a file hash does not prove deployment or that an observed build was generated from that source.

## Review Focus

- Public checks must reject API interception and invalid/insecure service URLs.
- Private environment files and dependency/cache trees must not enter source records or Docker contexts.
- A manifest must not include its own output and silently change identity on repetition.
- Explicit image inspection must fail honestly if Docker/image is unavailable.
- Rollback must use the retained prior artifact/image identity, not silently rebuild old code with new dependencies.

### Task 1: Same-origin verification and Docker contexts

**Files:** Existing smoke scripts, backend/frontend `.dockerignore`, current HTTPS/readiness documentation.

- [x] Implement explicit local/same-origin/public modes with documented request routing.
- [x] Verify rejection contracts and an actual local same-origin positive path; disclose TLS/public checks as unrun.
- [x] Exclude env/dependencies/caches from contexts while retaining all required source/config files.

### Task 2: Source/build identity and rollback instructions

**Files:** Create `scripts/capture_release_manifest.py` and `docs/NAR_RELEASE_READINESS.md`.

**Interfaces:** `python3 scripts/capture_release_manifest.py --out OUTSIDE_WEBSITE.json [--dist frontend/dist] [--image LOCAL_REFERENCE ...]`. Output includes actual Git context, deterministic source content SHA and per-file SHA/size, optional artifact SHA/size, explicit verification limits and actual inspected image ID/repository digests only.

- [x] Capture sorted Git tracked/nonignored source files without reading private env or external symlinks.
- [x] Require output outside website and refuse overwriting an existing release record.
- [x] Label dist as observed artifacts; never infer public deployment or successful Docker build.
- [x] Inspect only caller-supplied local images with argument-list subprocesses, retaining no image environment/config secrets.
- [x] Validate source-only capture against actual files and temporary Git fixtures covering env/symlink/output exclusions and a changed source file.
- [x] Document operator release and rollback using real retained images/manifests; leave domain, TLS, archive and maintenance facts pending.

### Task 3: Submission uploads and final review bundle

- [x] Separate cover letter, paste-ready Key Points, final-referee blank fields and exact graphical-abstract copies.
- [x] Verify new DOCX rendering and unchanged original manuscript/figure bytes.
- [x] Rebuild the private review archive and verify every archived file against its current disk hash.

## Completion evidence

2026-10-07: targeted smoke contract and release helper suites each passed five tests; actual Chrome/WebKit local same-origin entrypoint and private-env context-boundary checks passed. Temporary actual source/artifact capture independently matched all 225 file digests. Five DOCX and exact GA upload copies matched final QA; a rebuilt private review archive verified every member. Final source snapshot is taken after this plan update. Public HTTPS, actual container build/deployment and author facts remain unverified.
