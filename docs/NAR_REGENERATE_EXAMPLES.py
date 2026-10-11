"""Regenerate archived tutorial outputs with the current local backend engine.

From website/: backend/.venv/bin/python docs/NAR_REGENERATE_EXAMPLES.py
Only writes the three generated output JSON files and the refinement guide seed.
Example inputs remain explicit teaching records, not validation datasets.
"""
import json
import sys
from pathlib import Path

website = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(website / "backend"))
from app.modules.normal_editing import design_normal_editing
from app.modules.exon_skipping import design_exon_skipping
from app.schemas.design import NormalEditingRequest
from app.schemas.exon_skipping import ExonSkippingDesignRequest

examples = website / "frontend/public/examples"
normal_input = json.loads((examples / "normal-input.json").read_text())
exon_input = json.loads((examples / "exon-input.json").read_text())
refinement_input = json.loads((examples / "refinement-input.json").read_text())
normal = design_normal_editing(NormalEditingRequest(**normal_input))
exon = design_exon_skipping(ExonSkippingDesignRequest(**exon_input))
baseline = design_normal_editing(NormalEditingRequest(
    sequence=refinement_input["targetSequence"], target_position=refinement_input["targetAPosition"],
    adar_environment=refinement_input["environment"], coding_context=False))
refinement_input["arrnaSequence"] = next(c.arrna_sequence for c in baseline.candidates if c.id == "baseline")
for name, result in [("normal-output", normal), ("exon-output", exon), ("refinement-baseline-output", baseline)]:
    (examples / (name + ".json")).write_text(result.model_dump_json(indent=2) + "\n")
(examples / "refinement-input.json").write_text(json.dumps(refinement_input, indent=2) + "\n")
print("Regenerated current-engine tutorial records; efficiencies remain explicitly illustrative.")
