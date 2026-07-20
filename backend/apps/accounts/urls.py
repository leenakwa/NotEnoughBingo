from django.urls import path

from apps.accounts import views

urlpatterns = [
    path("csrf/", views.CsrfCookieView.as_view(), name="csrf"),
    path("register/", views.RegisterView.as_view(), name="register"),
    path("verify-email/", views.VerifyEmailView.as_view(), name="verify-email"),
    path(
        "resend-verification/",
        views.ResendVerificationView.as_view(),
        name="resend-verification",
    ),
    path("login/", views.LoginView.as_view(), name="login"),
    path("logout/", views.LogoutView.as_view(), name="logout"),
    path("me/", views.CurrentUserView.as_view(), name="me"),
    path("password-reset/", views.PasswordResetRequestView.as_view(), name="password-reset"),
    path(
        "password-reset/confirm/",
        views.PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path("password-change/", views.PasswordChangeView.as_view(), name="password-change"),
    path("sessions/", views.SessionListView.as_view(), name="sessions"),
    path("sessions/<uuid:public_id>/", views.SessionRevokeView.as_view(), name="session-revoke"),
    path("account-export/", views.AccountExportView.as_view(), name="account-export"),
    path("account-deletion/", views.AccountDeletionView.as_view(), name="account-deletion"),
]
