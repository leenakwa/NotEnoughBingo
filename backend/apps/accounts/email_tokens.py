from __future__ import annotations

import hashlib
import json

from django.conf import settings
from django.utils.crypto import constant_time_compare, salted_hmac

from apps.accounts.models import EmailVerification

VERIFICATION_SCHEME = "hmac_sha256_v1"
VERIFICATION_HMAC_DOMAIN = "accounts.email_verification.delivery.v1"


def derive_verification_token(verification: EmailVerification, *, secret: str | None = None) -> str:
    """Reconstruct a link without persisting its bearer credential.

    The random public UUID and immutable verification fields bind the token to
    one request. The dedicated salt separates this use of Django's secret key.
    """
    value = json.dumps(
        [
            str(verification.public_id),
            verification.user_id,
            verification.purpose,
            verification.email,
        ],
        separators=(",", ":"),
    )
    return salted_hmac(
        VERIFICATION_HMAC_DOMAIN, value, secret=secret, algorithm="sha256"
    ).hexdigest()


def recover_verification_token(verification: EmailVerification) -> str | None:
    if verification.delivery.get("token_scheme") != VERIFICATION_SCHEME:
        return None
    for secret in (settings.SECRET_KEY, *settings.SECRET_KEY_FALLBACKS):
        token = derive_verification_token(verification, secret=secret)
        digest = hashlib.sha256(token.encode()).hexdigest()
        if constant_time_compare(digest, verification.token_hash):
            return token
    return None
