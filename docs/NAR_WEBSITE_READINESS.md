# Website user documentation and readiness evidence

Updated 2026-10-06. This is a local readiness record, not a claim that changes are deployed or that biological performance has been validated.

## Authority and scope

Scientific instructions remain the author-provided fixed final LEAPER 3.0 protocol manuscript prepared for Nature Protocols, with publication/journal acceptance status unverified (`NatureProtocol/final/20180_1_art_file_302613_tm8fj0.pdf`), particularly arRNA design and experimental comparison requirements. The public guide names its alignment date and links published method studies through Citation; it does not invent a DOI for the protocol or website. Ranking/search limits are software heuristics; ESE motif scores and bulge directions require experiments. Combination testing is at fixed total nucleic-acid dose. Editing and exon skipping are distinct measured outcomes.

NAR requirements consulted directly on 2026-10-06: https://academic.oup.com/nar/pages/submission_webserver . Relevant requirements include accessible English help, parameter and result interpretation, downloadable input examples, interactive sample output, standard licence on the home page, private submissions without compulsory registration/email, no tracking cookies, working multi-service template and its prominent home-page link, HTTPS/443, and tests on at least two commonly used browsers.

## Implemented local user content

- Help: bilingual complete parameter/control tables for normal editing, exon skipping and refinement; coordinate conventions; defaults; empty-result meaning; result/structure explanation; FASTA/CSV/JSON differences; sharing limits; privacy and scientific uncertainty.
- API navigation now opens the in-site API guide, retaining a separate link to the actual Swagger schema. It lists the four production POST services, health and OpenAPI, request/response fields, errors and output interpretation. It explicitly identifies browser-only refinement and the unimplemented legacy task endpoint.
- Landing page directly links the downloadable Python standard-library template, help/downloads and independent synthetic exon/refinement examples. Existing PiZZ and live DMD examples remain. Apache-2.0 and CC BY 4.0 are visible on the home page; no new login/email gate.
- Three ready-to-run examples use the ordinary interactive UI; users can run and export them without retyping sequences. No synthetic efficiency is prefilled as measured evidence.
- Public downloads: `frontend/public/downloads/leaper_api_example.py`; six input/output JSON files under `frontend/public/examples/`. Input/output download links distinguish a refinement baseline design from a hypothetical optimization output.

## Example provenance and constraints

`normal-input.json` uses the existing 153 nt PiZZ CDS example (NM_000295.5 c.1021–1173, Z substitution at c.1096). A76, ADAR1, window −75…+75, no +4 internal deletion, coding context on. Current engine generates 4 candidates (151/141/123/113 nt). This is a computation, not new biological validation of PiZZ.

`exon-input.json` uses an explicitly synthetic 56 nt exon `CACACGA` repeated 8 times, upstream `T`×150 + `AG`, downstream `C`×151; x=151, covered-ESE evaluation enabled, exon A2/C added. Current engine yields SA and ESE candidates with full motif/region/settings evidence. The separate live DMD exon-51 example still requires NCBI and follows the retrieved transcript version.

`refinement-input.json` uses a synthetic 153 nt two-A target and the current normal engine's 151 nt antisense baseline, A76, ADAR1. The illustrative value 42% at A76 is labelled `illustrative_not_experimental`; A86 is unmeasured. Both fields begin empty in the UI. The downloaded file is a teaching seed, not a REST endpoint request. `refinement-baseline-output.json` records the exact engine-generated normal result supplying the baseline. It deliberately does not fake a post-experiment output or efficacy.

Standalone sequence import infers an alignment; long deletions and repetitive targets may not recover the original design uniquely. Help recommends entering from a normal result's Optimize action when the known generated duplex should be retained, and checking standalone inferred pairing before measurement entry.

## Verification

Example tests were observed failing because downloads were absent, then passing on generated files. They check the PiZZ candidate architecture, full synthetic ESE evidence, an importable two-A refinement baseline and explicit illustrative measurement metadata.

The Python template was actually run against local backend 8011. Its default path calls health, normal design, exon design and OpenAPI, parses sequences/coverage and writes full JSON; no Python packages or input preparation is required. `--include-ncbi` additionally chains live CDS/exon lookup into designs. This optional branch was also actually run against backend 8011 and completed successfully, including SERPINA1 CDS → normal design and DMD exon 51 → exon design; the outputs were retained under `/tmp/leaper-nar-api-ncbi`. Live reference lookup still depends on NCBI.

Cross-browser evidence and remaining operator requirements are recorded below after final verification. Screenshots and temporary script are verification artifacts under `/tmp/leaper-nar-crossbrowser`; they are not production dependencies.

## Operator-owned submission gates

- The current public HTTP address was checked read-only and returned HTTP 200. On 2026-10-06 its index still reported Last-Modified 2026-09-28; this is not evidence that current local guide/rules are deployed.
- Confirm final domain and HTTPS on port 443, public behaviour and downloaded assets after owner-approved deployment. No deployment occurred in this task.
- Audit production access logs, retention, infrastructure and privacy statement before claiming a server-side retention policy. The UI has no tracking/analytics and only localStorage language preference; design POSTs transmit sequences, and reference lookup transmits identifiers to NCBI. Shared fragments encode sequences without encryption. There is no public result gallery in application code.
- Software-conformance checks and biological outcome validation address different claims. Independent validation applies to predictive/efficacy claims; the qualitative direction/ranking feature may fall within that requirement and is disclosed for editorial assessment. No post-redesign outcome evidence has been located. Comparisons, maintenance commitments and manuscript claims must match actual evidence; passing software tests do not supply biological outcomes.

## Repeating browser checks

`docs/NAR_BROWSER_SMOKE.mjs` is a standalone Playwright verification artifact, not bundled into the site. Set `MODULE_ROOT` to a directory containing the Playwright package (or have Playwright available to Node), `CHROME_EXECUTABLE` to installed Google Chrome if desired, and optionally `FRONTEND_URL`, `BACKEND_URL` and `SCREENSHOT_DIR`. It runs actual Chrome/Chromium and a separate WebKit engine, never presents two Chromium sessions as two engines. Only forwarding to the local API port is intercepted; design responses are live. Checks include the home-page downloadable template, all six documented routes, in-page contents navigation without damaging the shared-state fragment, EN/Chinese help, actual template download, the normal/exon/refinement ready-to-run inputs and measurement/export behavior.

The installed old WebKit 2311 cache did not match the current Playwright 2336 protocol. A matching WebKit runtime was downloaded to the user browser cache; no product dependency or server configuration was changed. Actual passing browser versions and evidence are listed when the run completes below.

## Final observed results (2026-10-06)

- Initial frontend complete suite: 105 tests passed, 0 failed; production build passed. After four additional measurement regressions, the latest complete suite passed 109 tests and the build passed again; see the follow-up below.
- Real Google Chrome 154.0.8037.98 and Playwright WebKit 26.5 (separate browser engine): the repeatable browser smoke completed with both PASS and exit 0. This is an automated WebKit test, not a claim that a native Safari application was manually tested.
- Screenshots: `/tmp/leaper-nar-crossbrowser/{chrome,webkit}-{help-api,normal,refinement}.png`.
- The downloadable standard-library Python template completed both default and `--include-ncbi` runs against the actual local API. Normal/exon designs were never mocked. Optional live reference calls and subsequent chained designs succeeded.
- JSON outputs were generated through the current local backend modules, not fabricated. `docs/NAR_REGENERATE_EXAMPLES.py` repeats generation; run it from `website/` using the backend virtual-environment Python, then rerun the example tests.
- No deployment, push, manuscript publication or changes to the fixed final protocol occurred.

## Final content/TLS follow-up (2026-10-06)

Help and Citation now identify the scientific authority as the **author-provided fixed final protocol manuscript**, with publication/journal acceptance status explicitly unverified. “Approved” was removed from the method description; rule authority does not imply journal acceptance.

Prepared an opt-in, separate HTTPS/443 edge configuration in `docker-compose.https.optional.yml`, `deploy/https/Caddyfile` and `deploy/https/https.env.example`, documented in `docs/NAR_HTTPS_OPTIONAL.md` using official Caddy sources. The default production Compose/Nginx files and HTTP/8008 service were not changed. Domain/upstream variables are required; no domain, certificate or deployed TLS is asserted. Compose interpolation/schema checking passed with the standalone `docker-compose` command, an explicit credential-free env template and an offline `review.invalid` placeholder; no container was started, image pulled, ACME request sent or public listener created. Caddy runtime validation and public end-to-end HTTPS verification remain pending.

Submission/operator status remains:

- **Final domain:** owner has not supplied/confirmed it.
- **TLS:** optional configuration only; DNS, 80/443 availability, actual certificate issuance/renewal and public verification pending.
- **Retention/privacy:** no actual infrastructure log/retention/deletion policy has been verified. Not enabling a Caddy access log does not settle upstream Nginx/Uvicorn/container/cloud logs. Public claims must reflect the operator-confirmed policy.
- **Updated frontend build:** passed; exact output retained at `NAR/稿件版本/V12_2026-10-06_NAR投稿完善/qa/frontend_build_20261006.log` relative to the project root. Only the requested build was repeated for these text changes; the previously passing complete tests were not rerun.

## Additional measurement and installation checks (2026-10-06)

Out-of-range efficiencies are retained as invalid input with an explicit error,
excluded from measured evidence and blocked from optimization/export. A valid 0%
remains a measured zero; clearing restores unknown status. Changing A0 rebuilds
the refinement workspace, its relative structures and measurements. Both defects
were reproduced in real Chrome before the fix and checked again afterward. The
latest full suite passed 109/109 tests and the production build passed. Exact
inputs, browser script and logs are in V12
`qa/nar_refinement_additional_audit_20261006.*`.

The source-package installation workflow was verified in isolated copies with a
fresh Python 3.12.14 virtual environment and Node 24.19.0/npm 11.12.1. Editable
backend installation, dependency checking, ordinary `npm ci` and frontend build
succeeded. A separately started local backend returned 200 for health, OpenAPI
and a normal-design request; its four sequences matched the archived example.
Only that test process was stopped. See V12
`qa/local_installation_check_20261006.json`. Docker image building was not tested
because the Docker daemon was unavailable; no production container was started.

## Deployment verifier preparation (2026-10-06)

Both browser smoke scripts now share `scripts/smoke_target.mjs`. `SMOKE_MODE=public` requires an explicitly supplied real HTTPS root hostname on port 443, rejects local/placeholder/incorrect URLs, never routes API requests to a separate backend and never ignores TLS errors. `local-forward` preserves development forwarding; `same-origin` verifies a local loopback proxy directly without interception. The protocol smoke's NCBI mock is local-forward only. Public failure logs omit assertion bodies that could contain sequences.

Public preflight covers HTTP80→HTTPS443, health, actual `/api/v1/openapi`, Swagger, Python/example downloads and a real same-origin normal-design POST. Correct owner-run commands are in `NAR_HTTPS_OPTIONAL.md`. No real public domain has been supplied and no public acceptance run occurred.

Targeted verifier tests proved URL rejection and absence of routing in public/same-origin modes. A local transparent proxy to the running frontend/backend passed the direct same-origin endpoint/POST checks; a temporary offline self-signed TLS fixture was rejected. This is local harness evidence, not public TLS validation. The corresponding scripts/logs are archived in V12 QA under `nar_deployment_verifier_20261006.*`. Docker context exclusions were prepared without starting a daemon or building images. Domain, trusted certificate, DNS/ports, actual release identity and operator privacy/retention facts remain pending.
