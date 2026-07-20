from __future__ import annotations

import io
import json
import zipfile
from typing import Any

from django.apps import apps
from django.core.exceptions import ObjectDoesNotExist


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def build_account_export(user) -> bytes:
    profile = user.profile
    privacy = user.privacy
    bingos = []
    for bingo in user.bingos.select_related("current_revision").prefetch_related(
        "tag_links__tag",
        "draft",
        "revisions__cells",
        "revisions__revision_tags",
    ):
        revisions = []
        for revision in bingo.revisions.all():
            revisions.append(
                {
                    "id": str(revision.public_id),
                    "number": revision.revision_number,
                    "title": revision.title,
                    "description": revision.description,
                    "size": revision.size,
                    "visibility": revision.visibility,
                    "completion_style": revision.marking_style,
                    "published_at": _iso(revision.published_at),
                    "tags": [tag.name for tag in revision.revision_tags.all()],
                    "cells": [
                        {
                            "id": str(cell.public_id),
                            "row": cell.row,
                            "column": cell.column,
                            "text": cell.text,
                            "text_color": cell.text_color,
                            "bold": cell.bold,
                            "italic": cell.italic,
                            "underline": cell.underline,
                            "strikethrough": cell.strikethrough,
                            "background_color": cell.background_color,
                            "background_opacity": float(cell.background_opacity),
                            "image_opacity": float(cell.image_opacity),
                            "border_color": cell.border_color,
                            "border_width": cell.border_width,
                            "border_style": cell.border_style,
                        }
                        for cell in revision.cells.all()
                    ],
                }
            )
        try:
            draft = {
                "id": str(bingo.draft.public_id),
                "version": bingo.draft.version,
                "document": bingo.draft.document,
                "updated_at": _iso(bingo.draft.updated_at),
            }
        except ObjectDoesNotExist:
            draft = None
        bingos.append(
            {
                "id": str(bingo.public_id),
                "title": bingo.title,
                "description": bingo.description,
                "status": bingo.status,
                "visibility": bingo.visibility,
                "created_at": _iso(bingo.created_at),
                "updated_at": _iso(bingo.updated_at),
                "deleted_at": _iso(bingo.deleted_at),
                "draft": draft,
                "revisions": revisions,
            }
        )
    progress = [
        {
            "id": str(item.public_id),
            "bingo_id": str(item.bingo.public_id),
            "revision_id": str(item.revision.public_id),
            "selected_cells": item.selected_cells,
            "created_at": _iso(item.created_at),
            "updated_at": _iso(item.updated_at),
        }
        for item in user.play_progress.select_related("bingo", "revision")
    ]
    shares = [
        {
            "id": str(item.public_id),
            "share_id": item.share_id,
            "bingo_id": str(item.bingo.public_id),
            "revision_id": str(item.revision.public_id),
            "owner_display_name": item.owner_display_name,
            "selected_cells": item.selected_cells,
            "access": item.access,
            "created_at": _iso(item.created_at),
            "revoked_at": _iso(item.revoked_at),
        }
        for item in user.shared_results.select_related("bingo", "revision")
    ]
    payload: dict[str, Any] = {
        "export_schema_version": 1,
        "account": {
            "id": str(user.public_id),
            "email": user.email,
            "username": user.username,
            "email_verified_at": _iso(user.email_verified_at),
            "date_joined": _iso(user.date_joined),
            "last_login": _iso(user.last_login),
        },
        "profile": {
            "display_name": profile.display_name,
            "bio": profile.bio,
            "privacy": {
                "show_bio": privacy.show_bio,
                "show_created_bingos": privacy.show_created_bingos,
                "show_play_history": privacy.show_play_history,
                "show_shared_results": privacy.show_shared_results,
                "show_followers": privacy.show_followers,
                "show_following": privacy.show_following,
            },
        },
        "bingos": bingos,
        "play_progress": progress,
        "shared_results": shares,
        "follows": {
            "following": list(
                user.following_links.select_related("following").values_list(
                    "following__username",
                    flat=True,
                )
            ),
            "followers": list(
                user.follower_links.select_related("follower").values_list(
                    "follower__username",
                    flat=True,
                )
            ),
        },
    }
    optional_models = {
        "comments": ("social", "Comment", "author"),
        "notifications": ("notifications", "Notification", "recipient"),
        "reports": ("moderation", "Report", "reporter"),
        "interaction_events": ("analytics", "InteractionEvent", "actor"),
        "security_events": ("accounts", "SecurityEvent", "user"),
    }
    for key, (app_label, model_name, owner_field) in optional_models.items():
        try:
            model = apps.get_model(app_label, model_name)
            rows = model.objects.filter(**{owner_field: user}).values()
            payload[key] = [
                {
                    field: (
                        _iso(value)
                        if hasattr(value, "isoformat")
                        else str(value)
                        if field.endswith("_id") and value is not None
                        else value
                    )
                    for field, value in row.items()
                    if field
                    not in {
                        "id",
                        "session_key",
                        "token_hash",
                        "ip_hash",
                        "guest_session_hash",
                    }
                }
                for row in rows.iterator()
            ]
        except LookupError:
            payload[key] = []
    encoded = json.dumps(payload, ensure_ascii=False, indent=2, default=str).encode()
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("not-enough-bingo-account-data.json", encoded)
        archive.writestr(
            "README.txt",
            (
                "This archive contains the account data associated with your "
                "Not Enough Bingo account. It intentionally excludes password hashes, "
                "session secrets, verification tokens, and security digests.\n"
            ),
        )
    return output.getvalue()
