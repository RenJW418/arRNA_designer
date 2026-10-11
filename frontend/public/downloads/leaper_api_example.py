#!/usr/bin/env python3
"""LEAPER API working example (Python 3 standard library, Apache-2.0).

Run: python3 leaper_api_example.py --base-url https://YOUR-SERVER
Use the actual website origin, without /api/v1. Normal/exon teaching inputs
are embedded, so no extra input downloads, packages, API key or NCBI call
are needed. --include-ncbi adds live reference retrieval and chained design.
Outputs are computational examples, not experimental validation.
Guide alignment version: 2026-10-06 (LEAPER 3.0 Nature Protocols workflow).
"""
import argparse
import json
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

NORMAL_INPUT = {
    "sequence": "GACCTCTCCGGGGTCACAGAGGAGGCACCCCTGAAGCTCTCCAAGGCCGTGCATAAGGCTGTGCTGACCATCGACAAGAAAGGGACTGAAGCTGCTGGGGCCATGTTTTTAGAGGCCATACCCATGTCTATCCCCCCCGAGGTCAAGTTCAAC",
    "target_position": 76, "adar_environment": "ADAR1",
    "window_start_relative": -75, "window_end_relative": 75,
    "include_internal_bulge": False, "coding_context": True,
}
EXON_INPUT = {
    "upstream_intron": "T" * 150 + "AG", "exon": "CACACGA" * 8,
    "downstream_intron": "C" * 151, "arrna_length": 151,
    "evaluate_covered_ese": True, "ese_mismatch_positions": [2],
}


def call(base_url, path, payload=None, timeout=90):
    """Request JSON; HTTP detail and network failures are reported to the caller."""
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(base_url.rstrip("/") + path, data=data,
                      headers={"Content-Type": "application/json", "Accept": "application/json"})
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code} at {path}: {body}") from error
    except URLError as error:
        raise RuntimeError(f"Cannot reach {path}: {error.reason}") from error


def save(directory, name, value):
    path = directory / (name + ".json")
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="Website origin, e.g. http://127.0.0.1:8011")
    parser.add_argument("--output-dir", default="leaper-example-results")
    parser.add_argument("--include-ncbi", action="store_true", help="Also demonstrate live NCBI retrieval")
    args = parser.parse_args()
    origin = urlparse(args.base_url)
    if origin.scheme not in ("http", "https") or not origin.netloc or origin.path.rstrip("/"):
        parser.error("--base-url must be an http(s) origin without an API path")
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    print("Health:", call(args.base_url, "/health"))
    normal = call(args.base_url, "/api/v1/designs/normal-editing", NORMAL_INPUT)
    save(output, "normal-input", NORMAL_INPUT)
    save(output, "normal-output", normal)
    print("Normal pairing:", normal["pairing"]["is_satisfied"])
    for candidate in normal["candidates"]:
        print(candidate["id"], len(candidate["arrna_sequence"]), "nt")
    print("Normal warnings:", normal["warnings"])
    exon = call(args.base_url, "/api/v1/exon-skipping/design", EXON_INPUT)
    save(output, "exon-input", EXON_INPUT)
    save(output, "exon-output", exon)
    for candidate in exon["candidates"]:
        print(candidate["id"], candidate["kind"], len(candidate["arrna_sequence"]), "nt",
              "full regions", candidate["covered_region_indices"],
              "partial regions", candidate["partially_covered_region_indices"])
    print("Exon warnings:", exon["warnings"])
    # Save the exact current schema to inspect all supported fields.
    save(output, "openapi", call(args.base_url, "/api/v1/openapi"))
    if args.include_ncbi:
        coding = call(args.base_url, "/api/v1/references/ncbi/coding-sequence",
                      {"species": "9606", "gene": "SERPINA1"})
        save(output, "ncbi-coding-reference", coding)
        sequence = coding["cds_sequence"]
        target = next((i + 1 for i, base in enumerate(sequence)
                       if base == "A" and 75 <= i < len(sequence) - 75), None)
        if target is None:
            raise RuntimeError("The retrieved CDS has no A with complete 75 nt flanks")
        snapshot = {key: value for key, value in coding.items() if key != "cds_sequence"}
        request = {**NORMAL_INPUT, "sequence": sequence, "target_position": target, "reference": snapshot}
        save(output, "ncbi-normal-input", request)
        save(output, "ncbi-normal-output", call(args.base_url, "/api/v1/designs/normal-editing", request))
        reference = call(args.base_url, "/api/v1/references/ncbi/exon",
                         {"species": "9606", "gene": "DMD", "exon_number": 51, "flank_length": 151})
        save(output, "ncbi-exon-reference", reference)
        snapshot_keys = ("transcript", "species", "gene", "genomic_accession", "orientation",
                         "exon_genomic_start", "exon_genomic_end", "exon_number", "selection")
        request = {"upstream_intron": reference["upstream_intron"], "exon": reference["exon"],
                   "downstream_intron": reference["downstream_intron"], "arrna_length": 151,
                   "transcript": reference["transcript"], "exon_number": reference["exon_number"],
                   "reference": {key: reference[key] for key in snapshot_keys if key in reference},
                   "evaluate_covered_ese": False, "ese_mismatch_positions": []}
        save(output, "ncbi-exon-input", request)
        save(output, "ncbi-exon-output", call(args.base_url, "/api/v1/exon-skipping/design", request))
    print("Done. Inspect warnings and full JSON. Editing/exon-skipping activity requires experiments.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, KeyError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
