import pytest
from pydantic import ValidationError

from app.schemas.task import TaskCreate


def test_exon_skipping_requires_exon() -> None:
    with pytest.raises(ValidationError):
        TaskCreate.model_validate(
            {
                "mode": "sequence",
                "application_type": "exon_skipping",
                "sequence": "ACGT",
                "target": {
                    "coordinate_system": "sequence",
                    "position": 2,
                    "strand": "+",
                },
            }
        )
