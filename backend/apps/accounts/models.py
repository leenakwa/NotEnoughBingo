from __future__ import annotations

from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

from apps.common.models import PublicIdModel, TimeStampedModel


class AccountManager(UserManager["User"]):
    use_in_migrations = True

    def _create_user(self, username: str, email: str, password: str | None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email).lower()
        username = username.strip().lower()
        return super()._create_user(username, email, password, **extra_fields)

    def create_superuser(
        self,
        username: str,
        email: str,
        password: str | None = None,
        **extra_fields,
    ):
        extra_fields.setdefault("email_verified_at", timezone.now())
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser, PublicIdModel):
    email = models.EmailField(unique=True)
    email_verified_at = models.DateTimeField(null=True, blank=True, db_index=True)
    suspended_at = models.DateTimeField(null=True, blank=True, db_index=True)
    suspension_reason = models.CharField(max_length=500, blank=True)
    deletion_requested_at = models.DateTimeField(null=True, blank=True)
    deletion_scheduled_for = models.DateTimeField(null=True, blank=True, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    objects = AccountManager()

    class Meta(AbstractUser.Meta):
        constraints = [
            models.UniqueConstraint(Lower("username"), name="accounts_username_case_insensitive"),
            models.UniqueConstraint(Lower("email"), name="accounts_email_case_insensitive"),
        ]
        indexes = [
            models.Index(fields=("email_verified_at", "is_active")),
            models.Index(fields=("suspended_at", "is_active")),
        ]

    @property
    def is_email_verified(self) -> bool:
        return self.email_verified_at is not None

    @property
    def can_create_content(self) -> bool:
        return (
            self.is_active
            and self.is_email_verified
            and self.suspended_at is None
            and self.deletion_requested_at is None
            and self.deleted_at is None
        )


class UserProfile(PublicIdModel, TimeStampedModel):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    display_name = models.CharField(max_length=80, blank=True)
    bio = models.CharField(max_length=500, blank=True)
    avatar = models.ForeignKey(
        "media_assets.MediaAsset",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="profile_avatars",
    )

    class Meta:
        indexes = [models.Index(fields=("display_name",))]

    def __str__(self) -> str:
        return self.display_name or self.user.username


class UserPrivacySettings(TimeStampedModel):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="privacy")
    show_bio = models.BooleanField(default=True)
    show_created_bingos = models.BooleanField(default=True)
    show_play_history = models.BooleanField(default=True)
    show_shared_results = models.BooleanField(default=True)
    show_followers = models.BooleanField(default=True)
    show_following = models.BooleanField(default=True)


class EmailVerification(PublicIdModel, TimeStampedModel):
    class Purpose(models.TextChoices):
        VERIFY_EMAIL = "verify_email", "Verify email"
        CHANGE_EMAIL = "change_email", "Change email"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="email_verifications")
    email = models.EmailField()
    purpose = models.CharField(max_length=24, choices=Purpose.choices)
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField(db_index=True)
    used_at = models.DateTimeField(null=True, blank=True)
    attempt_count = models.PositiveSmallIntegerField(default=0)
    pending_username = models.CharField(max_length=150, blank=True)
    pending_display_name = models.CharField(max_length=80, blank=True)
    pending_password_hash = models.CharField(max_length=128, blank=True)

    class Meta:
        indexes = [models.Index(fields=("user", "purpose", "expires_at"))]


class SessionMetadata(PublicIdModel, TimeStampedModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="session_metadata")
    session_key = models.CharField(max_length=40, unique=True)
    ip_hash = models.CharField(max_length=64, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    device_name = models.CharField(max_length=120, blank=True)
    last_seen_at = models.DateTimeField(db_index=True)
    expires_at = models.DateTimeField(db_index=True)
    revoked_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        ordering = ("-last_seen_at",)
        indexes = [models.Index(fields=("user", "revoked_at", "last_seen_at"))]


class Follow(TimeStampedModel):
    follower = models.ForeignKey(User, on_delete=models.CASCADE, related_name="following_links")
    following = models.ForeignKey(User, on_delete=models.CASCADE, related_name="follower_links")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("follower", "following"), name="unique_follow"),
            models.CheckConstraint(
                condition=~models.Q(follower=models.F("following")),
                name="prevent_self_follow",
            ),
        ]
        indexes = [
            models.Index(fields=("follower", "-created_at")),
            models.Index(fields=("following", "-created_at")),
        ]


class NotificationPreference(TimeStampedModel):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="notification_preferences",
    )
    new_comment = models.BooleanField(default=True)
    comment_reply = models.BooleanField(default=True)
    bingo_like = models.BooleanField(default=True)
    comment_like = models.BooleanField(default=True)
    new_follower = models.BooleanField(default=True)
    marketing_email = models.BooleanField(default=False)


class SecurityEvent(PublicIdModel, TimeStampedModel):
    class EventType(models.TextChoices):
        REGISTERED = "registered", "Registered"
        EMAIL_VERIFIED = "email_verified", "Email verified"
        LOGIN = "login", "Login"
        LOGIN_FAILED = "login_failed", "Login failed"
        PASSWORD_CHANGED = "password_changed", "Password changed"
        PASSWORD_RESET = "password_reset", "Password reset"
        SESSION_REVOKED = "session_revoked", "Session revoked"
        ACCOUNT_DELETION_REQUESTED = "deletion_requested", "Account deletion requested"
        ACCOUNT_DELETED = "account_deleted", "Account deleted"

    user = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="security_events"
    )
    event_type = models.CharField(max_length=40, choices=EventType.choices)
    ip_hash = models.CharField(max_length=64, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("user", "event_type", "-created_at"))]


class AccountDeletionRequest(PublicIdModel, TimeStampedModel):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        CANCELLED = "cancelled", "Cancelled"
        PROCESSING = "processing", "Processing"
        COMPLETE = "complete", "Complete"
        FAILED = "failed", "Failed"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="deletion_requests")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.SCHEDULED)
    scheduled_for = models.DateTimeField(db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    error_code = models.CharField(max_length=80, blank=True)

    class Meta:
        indexes = [models.Index(fields=("status", "scheduled_for"))]
