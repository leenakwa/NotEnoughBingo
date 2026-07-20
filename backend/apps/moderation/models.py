from __future__ import annotations

from django.db import models

from apps.accounts.models import User, UserProfile
from apps.common.models import PublicIdModel, TimeStampedModel


class Report(PublicIdModel, TimeStampedModel):
    class TargetType(models.TextChoices):
        BINGO = "bingo", "Bingo"
        COMMENT = "comment", "Comment or reply"
        PROFILE = "profile", "Profile"

    class Reason(models.TextChoices):
        SPAM = "spam", "Spam"
        HARASSMENT = "harassment", "Harassment or bullying"
        HATE = "hate", "Hate speech"
        SEXUAL = "sexual", "Sexual content"
        VIOLENCE = "violence", "Violence"
        SELF_HARM = "self_harm", "Self-harm"
        IMPERSONATION = "impersonation", "Impersonation"
        COPYRIGHT = "copyright", "Copyright"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        IN_REVIEW = "in_review", "In review"
        RESOLVED = "resolved", "Resolved"
        DISMISSED = "dismissed", "Dismissed"

    reporter = models.ForeignKey(User, on_delete=models.PROTECT, related_name="reports")
    target_type = models.CharField(max_length=16, choices=TargetType.choices)
    bingo = models.ForeignKey(
        "bingos.Bingo",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="reports",
    )
    comment = models.ForeignKey(
        "social.Comment",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="reports",
    )
    profile = models.ForeignKey(
        UserProfile,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="reports",
    )
    reason = models.CharField(max_length=24, choices=Reason.choices)
    description = models.TextField(max_length=2_000, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    assigned_moderator = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_reports",
        limit_choices_to={"is_staff": True},
    )
    decision = models.CharField(max_length=500, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    context_snapshot = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("created_at",)
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(
                        target_type="bingo",
                        bingo__isnull=False,
                        comment__isnull=True,
                        profile__isnull=True,
                    )
                    | models.Q(
                        target_type="comment",
                        bingo__isnull=True,
                        comment__isnull=False,
                        profile__isnull=True,
                    )
                    | models.Q(
                        target_type="profile",
                        bingo__isnull=True,
                        comment__isnull=True,
                        profile__isnull=False,
                    )
                ),
                name="report_exactly_one_matching_target",
            ),
            models.UniqueConstraint(
                fields=("reporter", "bingo"),
                condition=models.Q(
                    bingo__isnull=False,
                    status__in=("open", "in_review"),
                ),
                name="unique_active_bingo_report_per_user",
            ),
            models.UniqueConstraint(
                fields=("reporter", "comment"),
                condition=models.Q(
                    comment__isnull=False,
                    status__in=("open", "in_review"),
                ),
                name="unique_active_comment_report_per_user",
            ),
            models.UniqueConstraint(
                fields=("reporter", "profile"),
                condition=models.Q(
                    profile__isnull=False,
                    status__in=("open", "in_review"),
                ),
                name="unique_active_profile_report_per_user",
            ),
        ]
        indexes = [
            models.Index(fields=("status", "target_type", "created_at")),
            models.Index(fields=("assigned_moderator", "status", "created_at")),
            models.Index(fields=("reporter", "-created_at")),
        ]


class ReportStatusHistory(TimeStampedModel):
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name="status_history")
    from_status = models.CharField(max_length=16, blank=True)
    to_status = models.CharField(max_length=16, choices=Report.Status.choices)
    changed_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    note = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ("created_at",)

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValueError("Report status history is append-only.")
        return super().save(*args, **kwargs)


class ModerationAction(PublicIdModel, TimeStampedModel):
    class Action(models.TextChoices):
        HIDE = "hide", "Hide content"
        RESTORE = "restore", "Restore content"
        SOFT_DELETE = "soft_delete", "Soft delete content"
        SUSPEND_USER = "suspend_user", "Suspend user"
        UNSUSPEND_USER = "unsuspend_user", "Unsuspend user"
        DISMISS = "dismiss", "Dismiss report"
        RESOLVE_NO_ACTION = "resolve_no_action", "Resolve without action"

    report = models.ForeignKey(
        Report, null=True, blank=True, on_delete=models.SET_NULL, related_name="actions"
    )
    moderator = models.ForeignKey(User, on_delete=models.PROTECT, related_name="moderation_actions")
    action = models.CharField(max_length=32, choices=Action.choices)
    target_type = models.CharField(max_length=16, choices=Report.TargetType.choices)
    target_public_id = models.CharField(max_length=64)
    reason = models.CharField(max_length=500)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("-created_at",)
        permissions = [
            ("moderate_content", "Can apply moderation actions"),
            ("view_private_content", "Can inspect private reported content"),
        ]
        indexes = [
            models.Index(fields=("target_type", "target_public_id", "-created_at")),
            models.Index(fields=("moderator", "-created_at")),
        ]

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValueError("Moderation actions are append-only.")
        return super().save(*args, **kwargs)
