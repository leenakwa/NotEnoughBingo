from __future__ import annotations

import re

from django.core.exceptions import ValidationError


class PredictablePasswordValidator:
    """Reject common starter words padded with numbers or punctuation."""

    def validate(self, password: str, user=None) -> None:
        normalized = re.sub(r"[^a-z0-9]", "", password.lower())
        if re.fullmatch(r"(?:password|qwerty|letmein|welcome|admin)[0-9]*", normalized):
            raise ValidationError(
                "Choose a less predictable password.",
                code="password_too_predictable",
            )

    def get_help_text(self) -> str:
        return "Avoid common words padded with numbers or punctuation."
