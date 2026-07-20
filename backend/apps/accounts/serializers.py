from __future__ import annotations

from django.contrib.auth import authenticate, password_validation
from django.contrib.auth.password_validation import validate_password
from drf_spectacular.helpers import lazy_serializer
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.accounts.models import (
    Follow,
    NotificationPreference,
    SessionMetadata,
    User,
    UserPrivacySettings,
    UserProfile,
)
from apps.media_assets.serializers import MediaAssetSerializer


class PublicUserSerializer(serializers.ModelSerializer[User]):
    id = serializers.UUIDField(source="public_id", read_only=True)
    display_name = serializers.CharField(source="profile.display_name", read_only=True)
    avatar = MediaAssetSerializer(source="profile.avatar", read_only=True, allow_null=True)

    class Meta:
        model = User
        fields = ("id", "username", "display_name", "avatar")


class CurrentUserSerializer(PublicUserSerializer):
    email_verified = serializers.BooleanField(source="is_email_verified", read_only=True)

    class Meta(PublicUserSerializer.Meta):
        fields = (*PublicUserSerializer.Meta.fields, "email", "email_verified")


class CsrfResponseSerializer(serializers.Serializer):
    csrf = serializers.CharField(read_only=True)


class RegistrationStatusSerializer(serializers.Serializer):
    status = serializers.CharField(read_only=True)


class AuthResultSerializer(serializers.Serializer):
    user = CurrentUserSerializer(read_only=True)


class FollowStateSerializer(serializers.Serializer):
    following = serializers.BooleanField(read_only=True)


class AccountDeletionResponseSerializer(serializers.Serializer):
    request_id = serializers.UUIDField(read_only=True)
    status = serializers.CharField(read_only=True)
    scheduled_for = serializers.DateTimeField(read_only=True)


class AccountExportResponseSerializer(serializers.Serializer):
    job_id = serializers.UUIDField(read_only=True)
    status = serializers.CharField(read_only=True)


class ProfileBingoCollectionSerializer(serializers.Serializer):
    count = serializers.IntegerField(min_value=0, read_only=True)
    next = serializers.URLField(read_only=True, allow_null=True)
    previous = serializers.URLField(read_only=True, allow_null=True)
    results = lazy_serializer("apps.bingos.serializers.BingoCardSerializer")(
        many=True,
        read_only=True,
    )


class UserProfileReadSerializer(serializers.ModelSerializer[UserProfile]):
    id = serializers.UUIDField(source="user.public_id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    avatar = MediaAssetSerializer(read_only=True, allow_null=True)
    follower_count = serializers.SerializerMethodField()
    following_count = serializers.SerializerMethodField()
    is_following = serializers.SerializerMethodField()
    privacy = serializers.SerializerMethodField()
    created_bingos = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = (
            "id",
            "username",
            "display_name",
            "avatar",
            "bio",
            "follower_count",
            "following_count",
            "is_following",
            "privacy",
            "created_bingos",
        )

    def _is_owner(self, obj: UserProfile) -> bool:
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and request.user.pk == obj.user_id)

    def get_follower_count(self, obj: UserProfile) -> int:
        if self._is_owner(obj) or obj.user.privacy.show_followers:
            return obj.user.follower_links.count()
        return 0

    def get_following_count(self, obj: UserProfile) -> int:
        if self._is_owner(obj) or obj.user.privacy.show_following:
            return obj.user.following_links.count()
        return 0

    def get_is_following(self, obj: UserProfile) -> bool:
        request = self.context.get("request")
        return bool(
            request
            and request.user.is_authenticated
            and request.user.pk != obj.user_id
            and Follow.objects.filter(follower=request.user, following=obj.user).exists()
        )

    @extend_schema_field(lazy_serializer("apps.accounts.serializers.PrivacySerializer")())
    def get_privacy(self, obj: UserProfile) -> dict:
        return PrivacySerializer(obj.user.privacy).data

    @extend_schema_field(ProfileBingoCollectionSerializer(allow_null=True))
    def get_created_bingos(self, obj: UserProfile) -> dict | None:
        privacy = obj.user.privacy
        if not self._is_owner(obj) and not privacy.show_created_bingos:
            return None

        from apps.bingos.models import Bingo
        from apps.bingos.serializers import BingoCardSerializer

        queryset = (
            Bingo.objects.public_catalog()
            .filter(author=obj.user)
            .select_related(
                "author",
                "author__profile",
                "author__profile__avatar",
                "cover",
                "current_revision",
            )
            .prefetch_related(
                "tag_links__tag",
                "cover__derivatives",
                "author__profile__avatar__derivatives",
            )
        )
        results = list(queryset[:12])
        return {
            "count": queryset.count(),
            "next": None,
            "previous": None,
            "results": BingoCardSerializer(
                results,
                many=True,
                context=self.context,
            ).data,
        }

    def to_representation(self, instance: UserProfile) -> dict:
        data = super().to_representation(instance)
        if not self._is_owner(instance) and not instance.user.privacy.show_bio:
            data["bio"] = ""
        return data


class RegistrationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    username = serializers.RegexField(r"^[a-zA-Z0-9_]{3,30}$", max_length=30)
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    display_name = serializers.CharField(max_length=80, allow_blank=True, required=False)

    def validate_email(self, value: str) -> str:
        return value.strip().lower()

    def validate_username(self, value: str) -> str:
        normalized = value.strip().lower()
        if User.objects.filter(username__iexact=normalized).exists():
            raise serializers.ValidationError("This username is unavailable.")
        return normalized

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs: dict) -> dict:
        request = self.context["request"]
        email = attrs["email"].strip().lower()
        authenticated = authenticate(
            request=request,
            email=email,
            password=attrs["password"],
            allow_pending_deletion=True,
        )
        if authenticated is None:
            raise serializers.ValidationError("Unable to sign in with the supplied credentials.")
        attrs["user"] = authenticated
        attrs["email"] = email
        return attrs


class EmailTokenSerializer(serializers.Serializer):
    token = serializers.CharField(min_length=32, max_length=200, trim_whitespace=True)


class EmailRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=200)
    token = serializers.CharField(max_length=200)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_new_password(self, value: str) -> str:
        validate_password(value)
        return value


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_current_password(self, value: str) -> str:
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("The current password is incorrect.")
        return value

    def validate_new_password(self, value: str) -> str:
        password_validation.validate_password(value, self.context["request"].user)
        return value


class ProfileUpdateSerializer(serializers.ModelSerializer[UserProfile]):
    avatar_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    username = serializers.RegexField(
        r"^[a-zA-Z0-9_]{3,30}$", max_length=30, source="user.username", required=False
    )

    class Meta:
        model = UserProfile
        fields = ("username", "display_name", "bio", "avatar_id")

    def validate_avatar_id(self, value):
        if value is None:
            return value
        from apps.media_assets.models import MediaAsset

        if not MediaAsset.objects.filter(
            public_id=value,
            owner=self.context["request"].user,
            kind=MediaAsset.Kind.AVATAR,
            status=MediaAsset.Status.READY,
        ).exists():
            raise serializers.ValidationError("The avatar asset is unavailable.")
        return value

    def update(self, instance: UserProfile, validated_data: dict) -> UserProfile:
        user_data = validated_data.pop("user", {})
        avatar_id = validated_data.pop("avatar_id", serializers.empty)
        if user_data:
            username = user_data["username"].lower()
            if User.objects.exclude(pk=instance.user_id).filter(username__iexact=username).exists():
                raise serializers.ValidationError({"username": "This username is unavailable."})
            instance.user.username = username
            instance.user.save(update_fields=("username",))
        if avatar_id is not serializers.empty:
            if avatar_id is None:
                instance.avatar = None
            else:
                from apps.media_assets.models import MediaAsset

                instance.avatar = MediaAsset.objects.get(public_id=avatar_id)
        return super().update(instance, validated_data)


class PrivacySerializer(serializers.ModelSerializer[UserPrivacySettings]):
    class Meta:
        model = UserPrivacySettings
        fields = (
            "show_bio",
            "show_created_bingos",
            "show_play_history",
            "show_shared_results",
            "show_followers",
            "show_following",
        )


class NotificationPreferenceSerializer(serializers.ModelSerializer[NotificationPreference]):
    class Meta:
        model = NotificationPreference
        fields = (
            "new_comment",
            "comment_reply",
            "bingo_like",
            "comment_like",
            "new_follower",
            "marketing_email",
        )


class SessionMetadataSerializer(serializers.ModelSerializer[SessionMetadata]):
    id = serializers.UUIDField(source="public_id", read_only=True)
    current = serializers.SerializerMethodField()
    ip_hint = serializers.SerializerMethodField()

    class Meta:
        model = SessionMetadata
        fields = (
            "id",
            "user_agent",
            "last_seen_at",
            "created_at",
            "ip_hint",
            "current",
        )

    def get_current(self, obj: SessionMetadata) -> bool:
        return obj.session_key == self.context["request"].session.session_key

    def get_ip_hint(self, obj: SessionMetadata) -> str:
        # Only a one-way digest is retained, so the API cannot leak a historical IP.
        return ""


class AccountDeletionSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_password(self, value: str) -> str:
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("The password is incorrect.")
        return value
