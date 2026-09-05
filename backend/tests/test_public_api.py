from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_api_documentation_is_available() -> None:
    assert client.get("/docs").status_code == 200
    assert client.get("/api/v1/openapi").status_code == 200
    assert "/api/v1/openapi" in client.get("/docs").text


def test_openapi_only_lists_working_public_endpoints() -> None:
    paths = set(client.get("/api/v1/openapi").json()["paths"])

    assert {
        "/health",
        "/api/v1/designs/normal-editing",
        "/api/v1/exon-skipping/design",
        "/api/v1/references/ncbi/exon",
        "/api/v1/references/ncbi/coding-sequence",
    }.issubset(paths)
    assert "/api/v1/tasks" not in paths
    assert "/api/v1/inputs/validate" not in paths
