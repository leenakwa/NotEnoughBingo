from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bingos.models import Bingo
from apps.common.idempotency import VALID_KEY
from apps.plays.models import PlayProgress, SharedResult
from apps.plays.serializers import (
    PlayProgressSerializer,
    ProgressWriteSerializer,
    SharedResultCreateSerializer,
    SharedResultSerializer,
)
from apps.plays.services import (
    accessible_play_bingo,
    can_view_shared_result,
    create_shared_result,
    guest_session_digest,
    replace_progress,
    reset_progress,
)


def _translate_domain_validation(exc: DjangoValidationError) -> ValidationError:
    if hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    return ValidationError(exc.messages)


class ProgressView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _bingo(self, request, bingo_id):
        try:
            return accessible_play_bingo(bingo_id=bingo_id, user=request.user)
        except Bingo.DoesNotExist as exc:
            raise NotFound() from exc

    @extend_schema(responses=PlayProgressSerializer)
    def get(self, request, bingo_id):
        bingo = self._bingo(request, bingo_id)
        progress = (
            PlayProgress.objects.select_related("bingo", "revision")
            .filter(user=request.user, bingo=bingo)
            .first()
        )
        if not progress:
            return Response(
                {
                    "public_id": None,
                    "bingo_id": str(bingo.public_id),
                    "revision_id": str(bingo.current_revision.public_id),
                    "revision_number": bingo.current_revision.revision_number,
                    "selected_cells": [],
                    "version": 0,
                    "stale": False,
                    "reset_at": None,
                    "created_at": None,
                    "updated_at": None,
                }
            )
        return Response(PlayProgressSerializer(progress).data)

    @extend_schema(request=ProgressWriteSerializer, responses=PlayProgressSerializer)
    def put(self, request, bingo_id):
        bingo = self._bingo(request, bingo_id)
        serializer = ProgressWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            progress = replace_progress(
                user=request.user,
                bingo=bingo,
                selected_cells=serializer.validated_data["selected_cells"],
                expected_version=serializer.validated_data.get("version"),
                revision_id=serializer.validated_data.get("revision_id"),
            )
        except DjangoValidationError as exc:
            raise _translate_domain_validation(exc) from exc
        progress = PlayProgress.objects.select_related("bingo", "revision").get(pk=progress.pk)
        return Response(PlayProgressSerializer(progress).data)

    @extend_schema(request=None, responses={204: None})
    def delete(self, request, bingo_id):
        bingo = self._bingo(request, bingo_id)
        reset_progress(user=request.user, bingo=bingo)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SharedResultCreateView(APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        request=SharedResultCreateSerializer,
        responses={201: SharedResultSerializer},
    )
    def post(self, request, bingo_id):
        try:
            bingo = accessible_play_bingo(
                bingo_id=bingo_id,
                user=request.user if request.user.is_authenticated else None,
            )
        except Bingo.DoesNotExist as exc:
            raise NotFound() from exc
        serializer = SharedResultCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        idempotency_key = request.headers.get("Idempotency-Key", "").strip()
        if not VALID_KEY.fullmatch(idempotency_key):
            raise ValidationError(
                {
                    "idempotency_key": (
                        "Use 8-128 letters, digits, dots, colons, underscores or hyphens."
                    )
                }
            )
        actor = request.user if request.user.is_authenticated else None
        if actor:
            display_name = serializer.validated_data.get("display_name", "").strip()
            if not display_name:
                display_name = actor.profile.display_name or actor.username
            guest_hash = ""
        else:
            display_name = serializer.validated_data.get("display_name", "")
            if not request.session.session_key:
                request.session.create()
            guest_hash = guest_session_digest(request.session.session_key)
        try:
            result = create_shared_result(
                bingo=bingo,
                selected_cells=serializer.validated_data["selected_cells"],
                display_name=display_name,
                idempotency_key=idempotency_key,
                actor=actor,
                guest_hash=guest_hash,
                revision_id=serializer.validated_data.get("revision_id"),
            )
        except DjangoValidationError as exc:
            raise _translate_domain_validation(exc) from exc
        result = (
            SharedResult.objects.select_related(
                "bingo",
                "revision",
                "revision__cover",
                "revision__background",
                "owner",
                "owner__profile",
                "owner__profile__avatar",
            )
            .prefetch_related(
                "revision__cells__image",
                "revision__cells__image__derivatives",
                "revision__cover__derivatives",
                "revision__background__derivatives",
                "owner__profile__avatar__derivatives",
                "revision__revision_tags",
            )
            .get(pk=result.pk)
        )
        return Response(SharedResultSerializer(result).data, status=status.HTTP_201_CREATED)


class SharedResultDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses=SharedResultSerializer)
    def get(self, request, bingo_id, share_id):
        result = get_object_or_404(
            SharedResult.objects.select_related(
                "bingo",
                "bingo__author",
                "revision",
                "revision__cover",
                "revision__background",
                "owner",
                "owner__profile",
                "owner__profile__avatar",
            ).prefetch_related(
                "revision__cells__image",
                "revision__cells__image__derivatives",
                "revision__cover__derivatives",
                "revision__background__derivatives",
                "owner__profile__avatar__derivatives",
                "revision__revision_tags",
            ),
            bingo__public_id=bingo_id,
            share_id=share_id,
        )
        if not can_view_shared_result(result=result, user=request.user):
            raise NotFound()
        return Response(SharedResultSerializer(result).data)
