"""ViennaRNA MFE and equilibrium pairing probabilities for the submitted arRNA."""

from importlib import import_module
from math import isfinite
from threading import BoundedSemaphore

from app.schemas.sequence_analysis import (
    RnaFoldRequest,
    RnaFoldResponse,
    StructureCoordinate,
    StructurePair,
)

_FOLD_CAPACITY = BoundedSemaphore(2)


class RnaFoldUnavailableError(RuntimeError):
    pass


class RnaFoldCalculationError(RuntimeError):
    pass


def _load_engine():
    try:
        return import_module("RNA")
    except (ImportError, OSError) as exc:
        raise RnaFoldUnavailableError("ViennaRNA is unavailable on this server") from exc


def fold_rna(payload: RnaFoldRequest) -> RnaFoldResponse:
    if not _FOLD_CAPACITY.acquire(blocking=False):
        raise RnaFoldUnavailableError("RNA folding capacity is busy; retry shortly")
    try:
        engine = _load_engine()
        model = engine.md()
        model.temperature = payload.temperature
        model.circ = int(payload.topology == "circular")
        model.compute_bpp = 1
        compound = engine.fold_compound(payload.sequence, model)
        structure, mfe = compound.mfe()
        compound.exp_params_rescale(mfe)
        _, ensemble_energy = compound.pf()
        diversity = compound.mean_bp_distance()
        if (any(not isfinite(value) or abs(value) >= 100_000
                for value in (mfe, ensemble_energy, diversity))
                or len(structure) != len(payload.sequence) or set(structure) - set(".()")):
            raise RnaFoldCalculationError("ViennaRNA could not compute a finite thermodynamic ensemble")
        probabilities = compound.bpp()
        size = len(payload.sequence)
        paired_probability = [0.0] * size
        # Use the entire partition-function probability matrix, without a display
        # cutoff. P(unpaired i) = 1 - sum_j P(i paired to j).
        for i in range(1, size + 1):
            for j in range(i + 1, size + 1):
                probability = probabilities[i][j]
                paired_probability[i - 1] += probability
                paired_probability[j - 1] += probability
        if any(not isfinite(p) or p < -1e-6 or p > 1 + 1e-6 for p in paired_probability):
            raise RnaFoldCalculationError("ViennaRNA returned invalid base-pair probabilities")
        unpaired = [min(1.0, max(0.0, 1 - p)) for p in paired_probability]
        stack = []
        pairs = []
        for j, symbol in enumerate(structure, start=1):
            if symbol == "(":
                stack.append(j)
            elif symbol == ")":
                i = stack.pop()
                pairs.append(StructurePair(i=i, j=j, probability=probabilities[i][j]))
        # This wrapper returns Python-owned coordinates (plus a trailing sentinel).
        # get_xy_coordinates instead returns an unowned C allocation.
        layout = engine.naview_xy_coordinates(structure)
        coordinates = [StructureCoordinate(x=layout[i].X, y=layout[i].Y)
                       for i in range(size)]
        return RnaFoldResponse(
            sequence=payload.sequence, structure=structure, mfe=mfe,
            ensemble_free_energy=ensemble_energy, ensemble_diversity=diversity,
            unpaired_probabilities=unpaired, mean_unpaired_probability=sum(unpaired) / size,
            mfe_unpaired_fraction=structure.count(".") / size,
            pairs=sorted(pairs, key=lambda pair: pair.i), coordinates=coordinates,
            engine="ViennaRNA", version=engine.__version__, temperature=payload.temperature,
            topology=payload.topology,
        )
    except (RnaFoldUnavailableError, RnaFoldCalculationError):
        raise
    except Exception as exc:
        # No sequence or native exception contents are exposed in messages/logs.
        raise RnaFoldCalculationError("ViennaRNA structure calculation failed") from exc
    finally:
        _FOLD_CAPACITY.release()
