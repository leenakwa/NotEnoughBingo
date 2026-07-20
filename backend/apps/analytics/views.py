from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.analytics.serializers import InteractionBatchSerializer
from apps.analytics.services import discover_feed, trending_feed
from apps.bingos.serializers import BingoCardSerializer
from apps.common.pagination import StandardPageNumberPagination


def _paginated_bingo_feed_schema(name: str):
    return inline_serializer(
        name=name,
        fields={
            "count": serializers.IntegerField(min_value=0),
            "next": serializers.URLField(allow_null=True),
            "previous": serializers.URLField(allow_null=True),
            "results": BingoCardSerializer(many=True),
        },
    )


class InteractionBatchView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "interactions"

    @extend_schema(
        request=InteractionBatchSerializer,
        responses={
            202: inline_serializer(
                name="InteractionBatchAcceptedResponse",
                fields={"accepted": serializers.IntegerField(min_value=0)},
            )
        },
    )
    def post(self, request):
        serializer = InteractionBatchSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        events = serializer.save()
        return Response({"accepted": len(events)}, status=status.HTTP_202_ACCEPTED)


class TrendingFeedView(APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses=_paginated_bingo_feed_schema("PaginatedTrendingFeedResponse"))
    def get(self, request):
        paginator = StandardPageNumberPagination()
        user = request.user if request.user.is_authenticated else None
        page = paginator.paginate_queryset(trending_feed(limit=240, user=user), request, view=self)
        return paginator.get_paginated_response(
            BingoCardSerializer(page, many=True, context={"request": request}).data
        )


class DiscoverFeedView(APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses=_paginated_bingo_feed_schema("PaginatedDiscoverFeedResponse"))
    def get(self, request):
        user = request.user if request.user.is_authenticated else None
        paginator = StandardPageNumberPagination()
        page = paginator.paginate_queryset(discover_feed(user, limit=240), request, view=self)
        return paginator.get_paginated_response(
            BingoCardSerializer(page, many=True, context={"request": request}).data
        )
