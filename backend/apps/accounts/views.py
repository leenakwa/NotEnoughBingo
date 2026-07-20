from __future__ import annotations

from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied, Throttled, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import Follow, SecurityEvent, SessionMetadata, User, UserProfile
from apps.accounts.security import LoginRateLimiter, hash_sensitive, request_ip
from apps.accounts.serializers import (
    AccountDeletionResponseSerializer,
    AccountDeletionSerializer,
    AccountExportResponseSerializer,
    AuthResultSerializer,
    CsrfResponseSerializer,
    CurrentUserSerializer,
    EmailRequestSerializer,
    EmailTokenSerializer,
    FollowStateSerializer,
    LoginSerializer,
    NotificationPreferenceSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PrivacySerializer,
    ProfileUpdateSerializer,
    PublicUserSerializer,
    RegistrationSerializer,
    RegistrationStatusSerializer,
    SessionMetadataSerializer,
    UserProfileReadSerializer,
)
from apps.accounts.services import (
    begin_registration,
    cancel_account_deletion,
    create_authenticated_session,
    destroy_authenticated_session,
    resend_email_verification,
    revoke_session,
    schedule_account_deletion,
    validate_account_can_authenticate,
    verify_email,
)
from apps.accounts.session_management import invalidate_session_keys
from apps.accounts.tasks import send_critical_security_email, send_password_reset_email
from apps.analytics.models import InteractionEvent
from apps.analytics.services import record_server_event
from apps.bingos.models import Bingo
from apps.bingos.serializers import BingoCardSerializer
from apps.common.pagination import StandardPageNumberPagination
from apps.plays.models import PlayProgress, SharedResult
from apps.plays.serializers import (
    ProfilePlayProgressSerializer,
    ProfileSharedResultSerializer,
)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfCookieView(APIView):
    authentication_classes: list = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses=CsrfResponseSerializer)
    def get(self, request):
        return Response({"csrf": "cookie_set"})


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_register"

    @extend_schema(
        request=RegistrationSerializer,
        responses={202: RegistrationStatusSerializer},
    )
    def post(self, request):
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        begin_registration(validated_data=serializer.validated_data)
        return Response(
            {"status": "verification_required"},
            status=status.HTTP_202_ACCEPTED,
        )


class VerifyEmailView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_verify"

    @extend_schema(
        request=EmailTokenSerializer,
        responses=CurrentUserSerializer,
    )
    def post(self, request):
        serializer = EmailTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = verify_email(serializer.validated_data["token"])
        except DjangoValidationError as exc:
            raise ValidationError({"token": exc.messages}) from exc
        return Response(CurrentUserSerializer(user).data)


class ResendVerificationView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_verify"

    @extend_schema(request=EmailRequestSerializer, responses={202: None})
    def post(self, request):
        serializer = EmailRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        resend_email_verification(serializer.validated_data["email"])
        return Response(status=status.HTTP_202_ACCEPTED)


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"

    @extend_schema(request=LoginSerializer, responses=AuthResultSerializer)
    def post(self, request):
        raw_email = str(request.data.get("email", "")).strip().lower()
        ip = request_ip(request)
        rate_state = LoginRateLimiter.check(email=raw_email, ip=ip)
        if not rate_state.allowed:
            raise Throttled(wait=rate_state.retry_after)
        serializer = LoginSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            LoginRateLimiter.failure(email=raw_email, ip=ip)
            SecurityEvent.objects.create(
                event_type=SecurityEvent.EventType.LOGIN_FAILED,
                ip_hash=hash_sensitive(ip),
                user_agent=request.headers.get("User-Agent", "")[:500],
                metadata={"email_hash": hash_sensitive(raw_email)},
            )
            raise ValidationError(serializer.errors)
        user = serializer.validated_data["user"]
        try:
            validate_account_can_authenticate(user)
        except DjangoValidationError as exc:
            raise PermissionDenied(exc.messages[0]) from exc
        LoginRateLimiter.success(email=raw_email)
        create_authenticated_session(request, user)
        return Response({"user": CurrentUserSerializer(user, context={"request": request}).data})


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        destroy_authenticated_session(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=CurrentUserSerializer)
    def get(self, request):
        return Response(CurrentUserSerializer(request.user).data)


class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    @extend_schema(request=EmailRequestSerializer, responses={202: None})
    def post(self, request):
        serializer = EmailRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(
            email__iexact=serializer.validated_data["email"], is_active=True
        ).first()
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            send_password_reset_email.delay(user.pk, uid, token)
        return Response(status=status.HTTP_202_ACCEPTED)


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    @extend_schema(request=PasswordResetConfirmSerializer, responses={204: None})
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user_id = force_str(urlsafe_base64_decode(serializer.validated_data["uid"]))
            user = User.objects.get(pk=user_id, is_active=True)
        except (ValueError, TypeError, OverflowError, User.DoesNotExist) as exc:
            raise ValidationError({"token": "The reset link is invalid or expired."}) from exc
        if not default_token_generator.check_token(user, serializer.validated_data["token"]):
            raise ValidationError({"token": "The reset link is invalid or expired."})
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=("password",))
        active_session_keys = list(
            SessionMetadata.objects.filter(
                user=user,
                revoked_at__isnull=True,
            ).values_list("session_key", flat=True)
        )
        SessionMetadata.objects.filter(
            user=user,
            revoked_at__isnull=True,
        ).update(revoked_at=timezone.now())
        invalidate_session_keys(active_session_keys)
        SecurityEvent.objects.create(user=user, event_type=SecurityEvent.EventType.PASSWORD_RESET)
        send_critical_security_email.delay(
            user.pk,
            "Your password was reset",
            (
                "Your Not Enough Bingo password was reset. "
                "Contact support immediately if this was not you."
            ),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordChangeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=PasswordChangeSerializer, responses={204: None})
    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        old_session_key = request.session.session_key
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=("password",))
        update_session_auth_hash(request, request.user)
        new_session_key = request.session.session_key
        if old_session_key and new_session_key and old_session_key != new_session_key:
            SessionMetadata.objects.filter(
                user=request.user,
                session_key=old_session_key,
            ).update(session_key=new_session_key, last_seen_at=timezone.now())
        other_session_keys = list(
            SessionMetadata.objects.filter(
                user=request.user,
                revoked_at__isnull=True,
            )
            .exclude(session_key=new_session_key)
            .values_list("session_key", flat=True)
        )
        SessionMetadata.objects.filter(user=request.user, revoked_at__isnull=True).exclude(
            session_key=new_session_key
        ).update(revoked_at=timezone.now())
        invalidate_session_keys(other_session_keys)
        SecurityEvent.objects.create(
            user=request.user, event_type=SecurityEvent.EventType.PASSWORD_CHANGED
        )
        send_critical_security_email.delay(
            request.user.pk,
            "Your password changed",
            "Your Not Enough Bingo password changed. Reset it immediately if this was not you.",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class SessionListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = SessionMetadataSerializer
    pagination_class = StandardPageNumberPagination

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return SessionMetadata.objects.none()
        return SessionMetadata.objects.filter(
            user=self.request.user,
            revoked_at__isnull=True,
            expires_at__gt=timezone.now(),
        )


class SessionRevokeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=None, responses={204: None})
    def delete(self, request, public_id):
        session = get_object_or_404(SessionMetadata, public_id=public_id, user=request.user)
        current = session.session_key == request.session.session_key
        revoke_session(user=request.user, session=session)
        if current:
            destroy_authenticated_session(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProfileMeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=UserProfileReadSerializer)
    def get(self, request):
        profile = UserProfile.objects.select_related(
            "user",
            "user__privacy",
            "avatar",
        ).get(pk=request.user.profile.pk)
        return Response(UserProfileReadSerializer(profile, context={"request": request}).data)

    @extend_schema(
        request=ProfileUpdateSerializer,
        responses=UserProfileReadSerializer,
    )
    def patch(self, request):
        serializer = ProfileUpdateSerializer(
            request.user.profile,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        profile = serializer.save()
        return Response(UserProfileReadSerializer(profile, context={"request": request}).data)


class PrivacyView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=PrivacySerializer)
    def get(self, request):
        return Response(PrivacySerializer(request.user.privacy).data)

    @extend_schema(request=PrivacySerializer, responses=PrivacySerializer)
    def patch(self, request):
        serializer = PrivacySerializer(request.user.privacy, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @extend_schema(request=PrivacySerializer, responses=PrivacySerializer)
    def put(self, request):
        serializer = PrivacySerializer(request.user.privacy, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class NotificationPreferenceView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=NotificationPreferenceSerializer)
    def get(self, request):
        return Response(
            NotificationPreferenceSerializer(request.user.notification_preferences).data
        )

    @extend_schema(
        request=NotificationPreferenceSerializer,
        responses=NotificationPreferenceSerializer,
    )
    def patch(self, request):
        serializer = NotificationPreferenceSerializer(
            request.user.notification_preferences, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PublicProfileView(APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses=UserProfileReadSerializer)
    def get(self, request, username):
        profile = get_object_or_404(
            UserProfile.objects.select_related("user", "user__privacy", "avatar"),
            user__username__iexact=username,
            user__is_active=True,
            user__suspended_at__isnull=True,
            user__deleted_at__isnull=True,
        )
        return Response(UserProfileReadSerializer(profile, context={"request": request}).data)


def _public_profile_user(username: str) -> User:
    return get_object_or_404(
        User.objects.select_related("profile", "privacy"),
        username__iexact=username,
        is_active=True,
        suspended_at__isnull=True,
        deleted_at__isnull=True,
    )


def _profile_owner(request, user: User) -> bool:
    return bool(request.user.is_authenticated and request.user.pk == user.pk)


class ProfileBingoListView(generics.ListAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = BingoCardSerializer
    pagination_class = StandardPageNumberPagination

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Bingo.objects.none()
        user = _public_profile_user(self.kwargs["username"])
        owner = _profile_owner(self.request, user)
        if not owner and not user.privacy.show_created_bingos:
            return Bingo.objects.none()
        queryset = (
            Bingo.objects.live().filter(author=user)
            if owner
            else Bingo.objects.public_catalog().filter(author=user)
        )
        queryset = queryset.select_related(
            "author",
            "author__profile",
            "author__profile__avatar",
            "cover",
            "current_revision",
        ).prefetch_related(
            "tag_links__tag",
            "cover__derivatives",
            "author__profile__avatar__derivatives",
        )
        if self.request.user.is_authenticated:
            from apps.social.models import BingoLike

            queryset = queryset.prefetch_related(
                Prefetch(
                    "likes",
                    queryset=BingoLike.objects.filter(user=self.request.user),
                    to_attr="_viewer_likes",
                )
            )
        return queryset.order_by("-updated_at")


class ProfilePlayHistoryView(generics.ListAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = ProfilePlayProgressSerializer
    pagination_class = StandardPageNumberPagination

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return PlayProgress.objects.none()
        user = _public_profile_user(self.kwargs["username"])
        owner = _profile_owner(self.request, user)
        if not owner and not user.privacy.show_play_history:
            return PlayProgress.objects.none()
        queryset = PlayProgress.objects.filter(user=user).select_related(
            "bingo",
            "revision",
        )
        if not owner:
            queryset = queryset.filter(
                bingo__status=Bingo.Status.PUBLISHED,
                bingo__visibility=Bingo.Visibility.PUBLIC,
                bingo__hidden_at__isnull=True,
                bingo__deleted_at__isnull=True,
            )
        return queryset.order_by("-updated_at")


class ProfileSharedResultListView(generics.ListAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = ProfileSharedResultSerializer
    pagination_class = StandardPageNumberPagination

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return SharedResult.objects.none()
        user = _public_profile_user(self.kwargs["username"])
        owner = _profile_owner(self.request, user)
        if not owner and not user.privacy.show_shared_results:
            return SharedResult.objects.none()
        queryset = SharedResult.objects.filter(owner=user).select_related(
            "bingo",
            "revision",
        )
        if not owner:
            queryset = queryset.filter(
                access=SharedResult.Access.PUBLIC,
                hidden_at__isnull=True,
                revoked_at__isnull=True,
                bingo__hidden_at__isnull=True,
            ).exclude(revision__visibility=Bingo.Visibility.PRIVATE)
        return queryset.order_by("-created_at")


class ProfileFollowerListView(generics.ListAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = PublicUserSerializer
    pagination_class = StandardPageNumberPagination

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return User.objects.none()
        user = _public_profile_user(self.kwargs["username"])
        if not _profile_owner(self.request, user) and not user.privacy.show_followers:
            return User.objects.none()
        return (
            User.objects.filter(
                following_links__following=user,
                is_active=True,
                suspended_at__isnull=True,
                deleted_at__isnull=True,
            )
            .select_related("profile", "profile__avatar")
            .prefetch_related("profile__avatar__derivatives")
            .order_by("-following_links__created_at")
        )


class ProfileFollowingListView(generics.ListAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = PublicUserSerializer
    pagination_class = StandardPageNumberPagination

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return User.objects.none()
        user = _public_profile_user(self.kwargs["username"])
        if not _profile_owner(self.request, user) and not user.privacy.show_following:
            return User.objects.none()
        return (
            User.objects.filter(
                follower_links__follower=user,
                is_active=True,
                suspended_at__isnull=True,
                deleted_at__isnull=True,
            )
            .select_related("profile", "profile__avatar")
            .prefetch_related("profile__avatar__derivatives")
            .order_by("-follower_links__created_at")
        )


class FollowView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=None, responses=FollowStateSerializer)
    def post(self, request, username):
        target = get_object_or_404(
            User,
            username__iexact=username,
            is_active=True,
            suspended_at__isnull=True,
            deleted_at__isnull=True,
        )
        if target.pk == request.user.pk:
            raise ValidationError({"username": "You cannot follow yourself."})
        follow, created = Follow.objects.get_or_create(follower=request.user, following=target)
        if created:
            from apps.notifications.models import Notification
            from apps.notifications.services import create_notification

            create_notification(
                recipient=target,
                actor=request.user,
                notification_type=Notification.Type.NEW_FOLLOWER,
                follow=follow,
                dedupe_key=f"follow:{request.user.pk}:{target.pk}",
            )
            record_server_event(
                event_type=InteractionEvent.Type.FOLLOW,
                actor=request.user,
                metadata={"target_user_id": str(target.public_id)},
            )
        return Response(
            {"following": True},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @extend_schema(request=None, responses={204: None})
    def delete(self, request, username):
        target = get_object_or_404(User, username__iexact=username)
        Follow.objects.filter(follower=request.user, following=target).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserFollowView(FollowView):
    def _target(self, public_id):
        return get_object_or_404(
            User,
            public_id=public_id,
            is_active=True,
            suspended_at__isnull=True,
            deleted_at__isnull=True,
        )

    @extend_schema(request=None, responses=FollowStateSerializer)
    def post(self, request, public_id):
        target = self._target(public_id)
        if target.pk == request.user.pk:
            raise ValidationError({"user": "You cannot follow yourself."})
        follow, created = Follow.objects.get_or_create(
            follower=request.user,
            following=target,
        )
        if created:
            from apps.notifications.models import Notification
            from apps.notifications.services import create_notification

            create_notification(
                recipient=target,
                actor=request.user,
                notification_type=Notification.Type.NEW_FOLLOWER,
                follow=follow,
                dedupe_key=f"follow:{request.user.pk}:{target.pk}",
            )
            record_server_event(
                event_type=InteractionEvent.Type.FOLLOW,
                actor=request.user,
                metadata={"target_user_id": str(target.public_id)},
            )
        return Response(
            {"following": True},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @extend_schema(request=None, responses={204: None})
    def delete(self, request, public_id):
        target = self._target(public_id)
        Follow.objects.filter(follower=request.user, following=target).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AccountDeletionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        request=AccountDeletionSerializer,
        responses={202: AccountDeletionResponseSerializer},
    )
    def post(self, request):
        serializer = AccountDeletionSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        deletion = schedule_account_deletion(request.user)
        return Response(
            {
                "request_id": str(deletion.public_id),
                "status": deletion.status,
                "scheduled_for": deletion.scheduled_for,
            },
            status=status.HTTP_202_ACCEPTED,
        )

    @extend_schema(request=None, responses={204: None})
    def delete(self, request):
        cancel_account_deletion(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AccountExportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=None, responses={202: AccountExportResponseSerializer})
    def post(self, request):
        from apps.exports.services import request_account_export

        job = request_account_export(request.user)
        return Response(
            {"job_id": str(job.public_id), "status": job.status},
            status=status.HTTP_202_ACCEPTED,
        )
