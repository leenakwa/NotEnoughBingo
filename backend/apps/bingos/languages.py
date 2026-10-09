"""Supported content languages. `und` is reserved for legacy published boards."""

from rest_framework.exceptions import ValidationError

LANGUAGE_CHOICES = (
    ("en", "English"),
    ("ru", "Russian"),
    ("uk", "Ukrainian"),
    ("es", "Spanish"),
    ("fr", "French"),
    ("de", "German"),
    ("pt", "Portuguese"),
    ("it", "Italian"),
    ("pl", "Polish"),
    ("tr", "Turkish"),
    ("ar", "Arabic"),
    ("hi", "Hindi"),
    ("ja", "Japanese"),
    ("ko", "Korean"),
    ("zh", "Chinese"),
)

LANGUAGE_CODES = frozenset(code for code, _ in LANGUAGE_CHOICES)


def requested_languages(params) -> list[str] | None:
    """Return an explicit language filter, or None for every language."""
    values = params.getlist("languages")
    if not values or values == ["all"]:
        return None
    if (
        len(values) > 15
        or len(values) != len(set(values))
        or any(code not in LANGUAGE_CODES for code in values)
    ):
        raise ValidationError({"languages": "Choose distinct supported languages."})
    return values
