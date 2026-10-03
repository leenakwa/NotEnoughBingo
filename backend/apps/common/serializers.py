from rest_framework import serializers


class ApiErrorDetailSerializer(serializers.Serializer):
    code = serializers.CharField(read_only=True)
    message = serializers.CharField(read_only=True)
    details = serializers.JSONField(read_only=True)
    request_id = serializers.CharField(read_only=True, allow_null=True)


class ApiErrorEnvelopeSerializer(serializers.Serializer):
    error = ApiErrorDetailSerializer(read_only=True)
