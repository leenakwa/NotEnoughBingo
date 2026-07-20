from __future__ import annotations

import json
import re
import uuid
from typing import Any

from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils.text import slugify

from apps.bingos.models import Bingo, BingoCell

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
MAX_DOCUMENT_BYTES = 512 * 1024
DOCUMENT_SCHEMA_VERSION = 1


def _invalid(field: str, message: str) -> ValidationError:
    return ValidationError({field: [message]})


def _color(value: Any, field: str, default: str) -> str:
    if value is None:
        return default
    if not isinstance(value, str) or not HEX_COLOR.fullmatch(value):
        raise _invalid(field, "Use a six-digit hexadecimal colour.")
    return value.lower()


def _opacity(value: Any, field: str, default: float = 1.0) -> float:
    if value is None:
        return default
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise _invalid(field, "Opacity must be a number between 0 and 1.")
    normalized = round(float(value), 3)
    if not 0 <= normalized <= 1:
        raise _invalid(field, "Opacity must be a number between 0 and 1.")
    return normalized


def _boolean(value: Any, field: str, default: bool = False) -> bool:
    if value is None:
        return default
    if not isinstance(value, bool):
        raise _invalid(field, "This value must be true or false.")
    return value


def _asset_id(value: Any, field: str) -> str | None:
    if value in (None, ""):
        return None
    try:
        return str(uuid.UUID(str(value)))
    except (TypeError, ValueError, AttributeError) as exc:
        raise _invalid(field, "Use a valid media asset identifier.") from exc


def _marking_config(value: Any, style: str) -> dict:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise _invalid("marking_config", "Marking configuration must be an object.")
    allowed = {"color", "opacity"}
    if set(value) - allowed:
        raise _invalid("marking_config", "Unsupported marking configuration field.")
    normalized: dict[str, Any] = {}
    if "color" in value:
        normalized["color"] = _color(value["color"], "marking_config.color", "#000000")
    if "opacity" in value:
        normalized["opacity"] = _opacity(
            value["opacity"],
            "marking_config.opacity",
            0.35 if style == Bingo.MarkingStyle.HIGHLIGHT else 1,
        )
    return normalized


def _normalize_tags(value: Any) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise _invalid("tags", "Tags must be a list.")
    if len(value) > 15:
        raise _invalid("tags", "A bingo can have at most 15 tags.")
    result: list[str] = []
    seen: set[str] = set()
    for raw in value:
        if not isinstance(raw, str):
            raise _invalid("tags", "Every tag must be text.")
        name = " ".join(raw.strip().lower().split())
        if not name or len(name) > 50 or not slugify(name, allow_unicode=True):
            raise _invalid("tags", "Each tag must contain 1 to 50 visible characters.")
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(name)
    return result


def _normalize_cell(raw: Any, *, position: int, size: int) -> dict:
    if not isinstance(raw, dict):
        raise _invalid("cells", f"Cell {position} must be an object.")
    allowed = {
        "id",
        "position",
        "row",
        "column",
        "text",
        "text_color",
        "bold",
        "italic",
        "underline",
        "strikethrough",
        "background_color",
        "background_opacity",
        "image_asset_id",
        "image_opacity",
        "border_color",
        "border_width",
        "border_style",
    }
    if set(raw) - allowed:
        raise _invalid("cells", f"Cell {position} contains unsupported fields.")
    supplied_position = raw.get("position", position)
    row = raw.get("row", position // size)
    column = raw.get("column", position % size)
    if (
        isinstance(supplied_position, bool)
        or not isinstance(supplied_position, int)
        or supplied_position != position
        or isinstance(row, bool)
        or not isinstance(row, int)
        or row != position // size
        or isinstance(column, bool)
        or not isinstance(column, int)
        or column != position % size
    ):
        raise _invalid("cells", f"Cell {position} has inconsistent coordinates.")
    raw_id = raw.get("id")
    try:
        cell_id = str(uuid.UUID(str(raw_id))) if raw_id else str(uuid.uuid4())
    except (TypeError, ValueError, AttributeError) as exc:
        raise _invalid("cells", f"Cell {position} has an invalid id.") from exc
    text = raw.get("text", "")
    if not isinstance(text, str) or len(text) > 100:
        raise _invalid("cells", f"Cell {position} text is longer than 100 characters.")
    border_width = raw.get("border_width", 1)
    if (
        isinstance(border_width, bool)
        or not isinstance(border_width, int)
        or not 0 <= border_width <= 12
    ):
        raise _invalid("cells", f"Cell {position} border width must be from 0 to 12.")
    border_style = raw.get("border_style", BingoCell.BorderStyle.SOLID)
    if border_style not in BingoCell.BorderStyle.values:
        raise _invalid("cells", f"Cell {position} has an unsupported border style.")
    return {
        "id": cell_id,
        "position": position,
        "row": row,
        "column": column,
        "text": text,
        "text_color": _color(raw.get("text_color"), "cells.text_color", "#000000"),
        "bold": _boolean(raw.get("bold"), "cells.bold"),
        "italic": _boolean(raw.get("italic"), "cells.italic"),
        "underline": _boolean(raw.get("underline"), "cells.underline"),
        "strikethrough": _boolean(raw.get("strikethrough"), "cells.strikethrough"),
        "background_color": _color(
            raw.get("background_color"),
            "cells.background_color",
            "#ffffff",
        ),
        "background_opacity": _opacity(
            raw.get("background_opacity"),
            "cells.background_opacity",
        ),
        "image_asset_id": _asset_id(raw.get("image_asset_id"), "cells.image_asset_id"),
        "image_opacity": _opacity(raw.get("image_opacity"), "cells.image_opacity"),
        "border_color": _color(
            raw.get("border_color"),
            "cells.border_color",
            "#000000",
        ),
        "border_width": border_width,
        "border_style": border_style,
    }


def normalize_draft_document(document: Any, *, require_publishable: bool = False) -> dict:
    if not isinstance(document, dict):
        raise _invalid("document", "The draft document must be an object.")
    document = dict(document)
    aliases = {
        "completion_style": "marking_style",
        "cover_id": "cover_asset_id",
        "board_background_id": "background_asset_id",
    }
    for alias, canonical in aliases.items():
        if alias not in document:
            continue
        if canonical in document and document[canonical] != document[alias]:
            raise _invalid(alias, f"{alias} conflicts with {canonical}.")
        document[canonical] = document.pop(alias)
    allowed = {
        "schema_version",
        "title",
        "description",
        "size",
        "visibility",
        "marking_style",
        "marking_config",
        "cover_asset_id",
        "background_asset_id",
        "tags",
        "cells",
    }
    if set(document) - allowed:
        raise _invalid("document", "The draft document contains unsupported fields.")
    schema_version = document.get("schema_version", DOCUMENT_SCHEMA_VERSION)
    if schema_version != DOCUMENT_SCHEMA_VERSION:
        raise _invalid("schema_version", "This editor document version is not supported.")
    title = document.get("title", "")
    if not isinstance(title, str):
        raise _invalid("title", "Title must be text.")
    title = title.strip()
    if len(title) > 70 or (require_publishable and not title):
        raise _invalid("title", "Published bingos need a title of at most 70 characters.")
    description = document.get("description", "")
    if not isinstance(description, str) or len(description) > 1000:
        raise _invalid("description", "Description must be at most 1000 characters.")
    size = document.get("size", 5)
    if isinstance(size, bool) or not isinstance(size, int) or not 3 <= size <= 10:
        raise _invalid("size", "Bingo size must be from 3 to 10.")
    visibility = document.get("visibility", Bingo.Visibility.PRIVATE)
    if visibility not in Bingo.Visibility.values:
        raise _invalid("visibility", "Unsupported visibility.")
    marking_style = document.get("marking_style", Bingo.MarkingStyle.CHECKMARK)
    if marking_style not in Bingo.MarkingStyle.values:
        raise _invalid("marking_style", "Unsupported marking style.")
    raw_cells = document.get("cells")
    if not isinstance(raw_cells, list) or len(raw_cells) != size * size:
        raise _invalid(
            "cells",
            f"A {size} x {size} board must contain exactly {size * size} cells.",
        )
    cells = [_normalize_cell(raw, position=index, size=size) for index, raw in enumerate(raw_cells)]
    ids = [cell["id"] for cell in cells]
    if len(ids) != len(set(ids)):
        raise _invalid("cells", "Cell ids must be unique within a board.")
    if sum(cell["image_asset_id"] is not None for cell in cells) > int(
        settings.MAX_CELL_IMAGES_PER_BINGO
    ):
        raise _invalid("cells", "This bingo contains too many cell images.")
    normalized = {
        "schema_version": DOCUMENT_SCHEMA_VERSION,
        "title": title,
        "description": description.strip(),
        "size": size,
        "visibility": visibility,
        "marking_style": marking_style,
        "marking_config": _marking_config(document.get("marking_config"), marking_style),
        "cover_asset_id": _asset_id(document.get("cover_asset_id"), "cover_asset_id"),
        "background_asset_id": _asset_id(
            document.get("background_asset_id"),
            "background_asset_id",
        ),
        "tags": _normalize_tags(document.get("tags")),
        "cells": cells,
    }
    encoded_size = len(json.dumps(normalized, separators=(",", ":"), ensure_ascii=False).encode())
    if encoded_size > MAX_DOCUMENT_BYTES:
        raise _invalid("document", "The draft document is too large.")
    return normalized


def empty_draft_document(*, title: str = "", size: int = 5) -> dict:
    return normalize_draft_document(
        {
            "title": title,
            "size": size,
            "cells": [{"position": position} for position in range(size * size)],
        }
    )
