from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.analytics.serializers import InteractionBatchSerializer
from apps.analytics.services import (
    DISCOVER_CANDIDATE_LIMIT,
    hydrate_feed_page,
    rank_discover_feed,
    trending_feed_candidates,
)
from apps.bingos.languages import requested_languages
from apps.bingos.serializers import BingoCardSerializer
from apps.common.pagination import StandardPageNumberPagination


class FeedPageNumberPagination(StandardPageNumberPagination):
    # Cards currently render bounded revision-cell previews.  Until publication
    # produces a single derived preview image, prevent clients from requesting
    # 100 complete 10x10 previews in one response.
    max_page_size = 24


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
        paginator = FeedPageNumberPagination()
        user = request.user if request.user.is_authenticated else None
        page_ids = paginator.paginate_queryset(
            trending_feed_candidates(),
            request,
            view=self,
        )
        page = hydrate_feed_page(page_ids or [], user)
        return paginator.get_paginated_response(
            BingoCardSerializer(page, many=True, context={"request": request}).data
        )


class DiscoverFeedView(APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        parameters=[
            OpenApiParameter(name="languages", type=str, many=True, style="form", explode=True)
        ],
        responses=_paginated_bingo_feed_schema("PaginatedDiscoverFeedResponse"),
    )
    def get(self, request):
        user = request.user if request.user.is_authenticated else None
        languages = requested_languages(request.query_params)
        if not request.query_params.getlist("languages") and user:
            profile = user.profile
            if profile.language_preferences_confirmed:
                languages = profile.preferred_languages
        paginator = FeedPageNumberPagination()
        ranked_ids = rank_discover_feed(user, limit=DISCOVER_CANDIDATE_LIMIT, languages=languages)
        page_ids = paginator.paginate_queryset(ranked_ids, request, view=self)
        page = hydrate_feed_page(page_ids or [], user)
        return paginator.get_paginated_response(
            BingoCardSerializer(page, many=True, context={"request": request}).data
        )
