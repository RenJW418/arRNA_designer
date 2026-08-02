from typing import Protocol

from app.schemas.task import TaskCreate, TaskCreated


class AnalysisNotImplementedError(NotImplementedError):
    """Raised until the validated LEAPER arRNA pipeline is integrated."""


class AnalysisEngine(Protocol):
    def submit(self, task: TaskCreate) -> TaskCreated:
        """Submit a validated design request without exposing implementation details."""


class PlaceholderAnalysisEngine:
    def submit(self, task: TaskCreate) -> TaskCreated:
        del task
        raise AnalysisNotImplementedError(
            "arRNA 设计算法尚未接入；输入契约已经固定，可在后续实现 AnalysisEngine。"
        )
