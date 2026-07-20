from django.urls import path

from apps.social import views

urlpatterns = [
    path("bingos/<uuid:bingo_id>/like/", views.BingoLikeView.as_view(), name="bingo-like"),
    path(
        "bingos/<uuid:bingo_id>/likes/",
        views.BingoLikeView.as_view(),
        name="bingo-likes",
    ),
    path(
        "bingos/<uuid:bingo_id>/comments/",
        views.CommentListCreateView.as_view(),
        name="comment-list",
    ),
    path(
        "comments/<uuid:comment_id>/",
        views.CommentDetailView.as_view(),
        name="comment-detail",
    ),
    path(
        "comments/<uuid:comment_id>/replies/",
        views.CommentReplyListCreateView.as_view(),
        name="comment-replies",
    ),
    path(
        "comments/<uuid:comment_id>/like/",
        views.CommentLikeView.as_view(),
        name="comment-like",
    ),
    path(
        "comments/<uuid:comment_id>/likes/",
        views.CommentLikeView.as_view(),
        name="comment-likes",
    ),
]
