from __future__ import annotations

from django.db.models import Q
from rest_framework import serializers

from apps.accounts.models import UserProfile
from apps.bingos.models import Bingo
from apps.moderation.models import ModerationAction, Report, ReportStatusHistory
from apps.social.models import Comment


class ReportCreateSerializer(serializers.Serializer):
    target_type = serializers.ChoiceField(choices=Report.TargetType.choices)
    target_id = serializers.UUIDField()
    reason = serializers.ChoiceField(choices=Report.Reason.choices)
    description = serializers.CharField(max_length=2_000, allow_blank=True, required=False)

    def validate(self, attrs: dict) -> dict:
        request = self.context["request"]
        model = {
            Report.TargetType.BINGO: Bingo,
            Report.TargetType.COMMENT: Comment,
            Report.TargetType.PROFILE: UserProfile,
        }[attrs["target_type"]]
        try:
            if model is UserProfile:
                target = UserProfile.objects.select_related("user").get(
                    Q(public_id=attrs["target_id"]) | Q(user__public_id=attrs["target_id"])
                )
            else:
                target = model.objects.select_related(
                    *(("author",) if model is Bingo else ("author", "bingo"))
                ).get(public_id=attrs["target_id"])
        except model.DoesNotExist as exc:
            raise serializers.ValidationError(
                {"target_id": "The reported object is unavailable."}
            ) from exc

        if model is Bingo:
            owner = target.author_id == request.user.pk
            publicly_accessible = (
                target.status == Bingo.Status.PUBLISHED
                and target.visibility in (Bingo.Visibility.PUBLIC, Bingo.Visibility.UNLISTED)
                and target.deleted_at is None
                and target.hidden_at is None
            )
            if not owner and not publicly_accessible:
                raise serializers.ValidationError(
                    {"target_id": "The reported object is unavailable."}
                )
            if owner:
                raise serializers.ValidationError(
                    {"target_id": "You cannot report your own bingo."}
                )
        elif model is Comment:
            bingo = target.bingo
            owner = bingo.author_id == request.user.pk
            publicly_accessible = (
                bingo.status == Bingo.Status.PUBLISHED
                and bingo.visibility in (Bingo.Visibility.PUBLIC, Bingo.Visibility.UNLISTED)
                and bingo.deleted_at is None
                and bingo.hidden_at is None
            )
            if (
                target.deleted_at is not None
                or target.hidden_at is not None
                or (not owner and not publicly_accessible)
            ):
                raise serializers.ValidationError(
                    {"target_id": "The reported object is unavailable."}
                )
            if target.author_id == request.user.pk:
                raise serializers.ValidationError(
                    {"target_id": "You cannot report your own comment."}
                )
        elif target.user_id == request.user.pk:
            raise serializers.ValidationError({"target_id": "You cannot report your own profile."})
        elif not target.user.is_active or target.user.deleted_at is not None:
            raise serializers.ValidationError({"target_id": "The reported object is unavailable."})
        attrs["target"] = target
        return attrs


class ReportStatusHistorySerializer(serializers.ModelSerializer[ReportStatusHistory]):
    changed_by = serializers.CharField(source="changed_by.username", allow_null=True)

    class Meta:
        model = ReportStatusHistory
        fields = ("from_status", "to_status", "changed_by", "note", "created_at")


class ModerationActionSerializer(serializers.ModelSerializer[ModerationAction]):
    moderator = serializers.CharField(source="moderator.username")
    metadata = serializers.DictField(
        child=serializers.CharField(allow_null=True),
        read_only=True,
    )

    class Meta:
        model = ModerationAction
        fields = (
            "public_id",
            "moderator",
            "action",
            "target_type",
            "target_public_id",
            "reason",
            "metadata",
            "created_at",
        )


class ReportSerializer(serializers.ModelSerializer[Report]):
    reporter = serializers.CharField(source="reporter.username")
    assigned_moderator = serializers.CharField(
        source="assigned_moderator.username", allow_null=True
    )
    status_history = ReportStatusHistorySerializer(many=True, read_only=True)
    actions = ModerationActionSerializer(many=True, read_only=True)
    context_snapshot = serializers.DictField(
        child=serializers.CharField(allow_null=True),
        read_only=True,
    )

    class Meta:
        model = Report
        fields = (
            "public_id",
            "reporter",
            "target_type",
            "reason",
            "description",
            "status",
            "assigned_moderator",
            "decision",
            "resolved_at",
            "context_snapshot",
            "status_history",
            "actions",
            "created_at",
            "updated_at",
        )


class ModerationActionRequestSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=ModerationAction.Action.choices)
    reason = serializers.CharField(max_length=500)
