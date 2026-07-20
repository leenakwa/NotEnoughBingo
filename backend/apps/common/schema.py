from drf_spectacular.extensions import OpenApiAuthenticationExtension


class SessionCookieAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "apps.common.authentication.StrictSessionAuthentication"
    name = "sessionCookie"

    def get_security_definition(self, auto_schema):
        return {
            "type": "apiKey",
            "in": "cookie",
            "name": "neb_session",
            "description": (
                "Django session cookie. Unsafe requests also require the "
                "neb_csrf cookie value in the X-CSRFToken header."
            ),
        }
