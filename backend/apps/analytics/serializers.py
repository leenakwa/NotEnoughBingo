from __future__ import annotations

import json
from datetime import timedelta

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework import serializers

from apps.accounts.security import hash_sensitive
from apps.analytics.models import InteractionEvent
from apps.bingos.models import Bingo, BingoRevision, Tag


class InteractionMetadataSerializer(serializers.Serializer):
    surface = serializers.ChoiceField(
        choices=("discover", "trending", "explore", "profile", "share", "direct"),
        required=False,
    )
    author = serializers.CharField(max_length=150, required=False, allow_blank=True)
    tags = serializers.CharField(max_length=500, required=False, allow_blank=True)
    ordering = serializers.ChoiceField(
        choices=("newest", "popular"),
        required=False,
        allow_blank=True,
    )


class InteractionEventSerializer(serializers.ModelSerializer[InteractionEvent]):
    # Idempotency is implemented atomically in create(); DRF's model-level
    # UniqueValidator would reject a legitimate retry before it reaches that
    # code path.
    client_event_id = serializers.UUIDField(
        required=True,
        allow_null=False,
        validators=[],
    )
    bingo_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    revision_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    tag = serializers.SlugField(write_only=True, required=False, allow_null=True)
    anonymous_id = serializers.CharField(
        write_only=True, required=False, allow_blank=True, max_length=200
    )
    metadata = InteractionMetadataSerializer(required=False)

    class Meta:
        model = InteractionEvent
        fields = (
            "client_event_id",
            "event_type",
            "bingo_id",
            "revision_id",
            "tag",
            "query",
            "metadata",
            "occurred_at",
            "anonymous_id",
        )

    def validate(self, attrs: dict) -> dict:
        request = self.context["request"]
        server_authoritative = {
            InteractionEvent.Type.LIKE,
            InteractionEvent.Type.UNLIKE,
            InteractionEvent.Type.SHARE,
            InteractionEvent.Type.COMMENT,
            InteractionEvent.Type.FOLLOW,
        }
        if attrs["event_type"] in server_authoritative:
            raise serializers.ValidationError(
                {"event_type": "This event is recorded by the server."}
            )
        if not request.user.is_authenticated and not attrs.get("anonymous_id"):
            raise serializers.ValidationError(
                {"anonymous_id": "An anonymous session identifier is required."}
            )
        metadata = attrs.get("metadata", {})
        search_only_keys = set(metadata) - {"surface"}
        if search_only_keys and attrs["event_type"] != InteractionEvent.Type.SEARCH:
            raise serializers.ValidationError(
                {"metadata": "Client metadata is only accepted for search events."}
            )
        return attrs

    def validate_occurred_at(self, value):
        now = timezone.now()
        if value < now - timedelta(days=7) or value > now + timedelta(minutes=5):
            raise serializers.ValidationError("The event timestamp is outside the accepted window.")
        return value

    def validate_metadata(self, value: dict) -> dict:
        if len(json.dumps(value, separators=(",", ":"))) > 4_000:
            raise serializers.ValidationError("Event metadata is too large.")
        forbidden_fragments = {
            "authorization",
            "cookie",
            "email",
            "password",
            "secret",
            "session",
            "token",
        }

        def keys(item):
            if isinstance(item, dict):
                for key, nested in item.items():
                    yield str(key).lower()
                    yield from keys(nested)
            elif isinstance(item, list):
                for nested in item:
                    yield from keys(nested)

        if any(fragment in key for key in keys(value) for fragment in forbidden_fragments):
            raise serializers.ValidationError("Sensitive metadata keys are not accepted.")
        return value

    def create(self, validated_data: dict) -> InteractionEvent:
        request = self.context["request"]
        bingo_public_id = validated_data.pop("bingo_id", None)
        revision_public_id = validated_data.pop("revision_id", None)
        tag_slug = validated_data.pop("tag", None)
        anonymous_id = validated_data.pop("anonymous_id", "")
        bingo = None
        if bingo_public_id:
            bingo = (
                Bingo.objects.filter(
                    public_id=bingo_public_id,
                    status=Bingo.Status.PUBLISHED,
                    deleted_at__isnull=True,
                    hidden_at__isnull=True,
                )
                .exclude(visibility=Bingo.Visibility.PRIVATE)
                .first()
            )
            if not bingo and request.user.is_authenticated:
                bingo = Bingo.objects.filter(
                    public_id=bingo_public_id, author=request.user, deleted_at__isnull=True
                ).first()
            if not bingo:
                raise serializers.ValidationError({"bingo_id": "The bingo is unavailable."})
        revision = None
        if revision_public_id:
            revision = BingoRevision.objects.filter(
                public_id=revision_public_id,
                bingo=bingo,
            ).first()
            if not revision:
                raise serializers.ValidationError({"revision_id": "The revision is unavailable."})
        tag = Tag.objects.filter(slug=tag_slug).first() if tag_slug else None
        if tag_slug and not tag:
            raise serializers.ValidationError({"tag": "The tag is unavailable."})
        authenticated = request.user.is_authenticated
        values = {
            "actor": request.user if authenticated else None,
            "anonymous_id_hash": (
                hash_sensitive(anonymous_id) if anonymous_id and not authenticated else ""
            ),
            "bingo": bingo,
            "revision": revision,
            "tag": tag,
            **validated_data,
        }
        client_event_id = values.pop("client_event_id", None)
        if client_event_id:
            event, created = InteractionEvent.objects.get_or_create(
                client_event_id=client_event_id,
                defaults=values,
            )
            if not created and not self._matches_existing(event, values):
                raise serializers.ValidationError(
                    {
                        "client_event_id": (
                            "This event id was already used for different interaction data."
                        )
                    }
                )
            if created:
                self._increment_counter(event)
            return event
        event = InteractionEvent.objects.create(**values)
        self._increment_counter(event)
        return event

    def _matches_existing(self, event: InteractionEvent, values: dict) -> bool:
        return (
            event.actor_id == getattr(values.get("actor"), "pk", None)
            and event.anonymous_id_hash == values.get("anonymous_id_hash", "")
            and event.event_type == values["event_type"]
            and event.bingo_id == getattr(values.get("bingo"), "pk", None)
            and event.revision_id == getattr(values.get("revision"), "pk", None)
            and event.tag_id == getattr(values.get("tag"), "pk", None)
            and event.query == values.get("query", "")
            and event.metadata == values.get("metadata", {})
            and event.occurred_at == values["occurred_at"]
        )

    def _increment_counter(self, event: InteractionEvent) -> None:
        if not event.bingo_id:
            return
        if event.event_type == InteractionEvent.Type.VIEW:
            Bingo.objects.filter(pk=event.bingo_id).update(view_count=F("view_count") + 1)
        elif event.event_type == InteractionEvent.Type.START and event.actor_id is None:
            Bingo.objects.filter(pk=event.bingo_id).update(play_count=F("play_count") + 1)


class InteractionBatchSerializer(serializers.Serializer):
    events = InteractionEventSerializer(many=True, max_length=100)

    @transaction.atomic
    def create(self, validated_data: dict) -> list[InteractionEvent]:
        child = self.fields["events"].child
        return [child.create(item) for item in validated_data["events"]]
