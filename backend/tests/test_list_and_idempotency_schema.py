from __future__ import annotations

import pytest
from drf_spectacular.generators import SchemaGenerator


@pytest.fixture(scope="module")
def schema() -> dict:
    return SchemaGenerator().get_schema(request=None, public=True)


@pytest.mark.parametrize(
    ("path", "component"),
    [
        ("/api/v1/drafts/", "PaginatedDraftList"),
        ("/api/v1/bingos/{bingo_id}/revisions/", "PaginatedBingoRevisionList"),
    ],
)
def test_author_list_schema_describes_standard_pages(schema, path, component) -> None:
    operation = schema["paths"][path]["get"]
    assert {"page", "page_size"}.issubset(
        {parameter["name"] for parameter in operation["parameters"]}
    )
    page_size = next(item for item in operation["parameters"] if item["name"] == "page_size")
    assert page_size["schema"]["default"] == 24
    assert "capped at 100" in page_size["description"]
    response = operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert response == {"$ref": f"#/components/schemas/{component}"}
    assert set(schema["components"]["schemas"][component]["properties"]) == {
        "count",
        "next",
        "previous",
        "results",
    }


@pytest.mark.parametrize(
    ("path", "success", "conflict"),
    [
        ("/api/v1/drafts/", "201", "409"),
        ("/api/v1/bingos/{bingo_id}/publish/", "201", "409"),
        ("/api/v1/bingos/{bingo_id}/shares/", "201", "409"),
        ("/api/v1/bingos/{bingo_id}/exports/", "202", "400"),
    ],
)
def test_content_creation_schema_requires_runtime_idempotency_key(
    schema, path, success, conflict
) -> None:
    operation = schema["paths"][path]["post"]
    parameter = next(item for item in operation["parameters"] if item["name"] == "Idempotency-Key")
    assert parameter["in"] == "header"
    assert parameter["required"] is True
    assert parameter["schema"] == {
        "type": "string",
        "minLength": 8,
        "maxLength": 128,
        "pattern": "^[A-Za-z0-9._:-]{8,128}$",
    }
    assert success in operation["responses"]
    assert conflict in operation["responses"]
    assert operation["responses"][success]["description"]
    assert operation["responses"][conflict]["description"]
    assert (
        operation["responses"][conflict]["content"]["application/json"]["schema"]["type"]
        == "object"
    )


def test_only_draft_creation_documents_its_actual_replay_header(schema) -> None:
    draft_response = schema["paths"]["/api/v1/drafts/"]["post"]["responses"]["201"]
    assert draft_response["headers"]["Idempotency-Replayed"]["schema"]["enum"] == ["true"]
    for path, status in [
        ("/api/v1/bingos/{bingo_id}/publish/", "201"),
        ("/api/v1/bingos/{bingo_id}/shares/", "201"),
        ("/api/v1/bingos/{bingo_id}/exports/", "202"),
    ]:
        response = schema["paths"][path]["post"]["responses"][status]
        assert "Idempotency-Replayed" not in response.get("headers", {})
