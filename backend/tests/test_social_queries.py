from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.media_assets.models import MediaAsset
from apps.social.models import Comment, CommentLike

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("signed_in", [False, True])
@pytest.mark.parametrize("replies_page", [False, True])
def test_comment_page_queries_stay_bounded_with_authors_avatars_and_replies(
    signed_in, replies_page, verified_user_factory, bingo_factory, record_testsuite_property
) -> None:
    viewer = verified_user_factory()
    bingo = bingo_factory(author=viewer)
    parent = Comment.objects.create(bingo=bingo, author=viewer, body="Conversation")
    client = APIClient()
    if signed_in:
        client.force_authenticate(viewer)
    path = (
        f"/api/v1/comments/{parent.public_id}/replies/"
        if replies_page
        else f"/api/v1/bingos/{bingo.public_id}/comments/"
    )

    def add_comment(number: int) -> None:
        author = verified_user_factory()
        avatar = MediaAsset.objects.create(
            owner=author,
            kind=MediaAsset.Kind.AVATAR,
            status=MediaAsset.Status.READY,
            storage_key=f"query-avatar-{author.public_id}",
        )
        MediaAsset.objects.create(
            owner=author,
            parent=avatar,
            kind=MediaAsset.Kind.AVATAR,
            variant=MediaAsset.Variant.THUMBNAIL,
            status=MediaAsset.Status.READY,
            storage_key=f"query-thumbnail-{author.public_id}",
        )
        author.profile.avatar = avatar
        author.profile.save(update_fields=["avatar"])
        comment = Comment.objects.create(
            bingo=bingo,
            author=author,
            parent=parent if replies_page else None,
            body=f"Comment {number}",
        )
        CommentLike.objects.create(user=viewer, comment=comment)
        if not replies_page:
            children = Comment.objects.bulk_create(
                [
                    Comment(bingo=bingo, author=author, parent=comment, body=f"Reply {index}")
                    for index in range(6)
                ]
            )
            CommentLike.objects.create(user=viewer, comment=children[0])
            Comment.objects.filter(pk=comment.pk).update(reply_count=6)

    add_comment(1)
    with CaptureQueriesContext(connection) as small_queries:
        small = client.get(path, {"page_size": 24})
    assert small.status_code == 200
    for number in range(2, 25):
        add_comment(number)
    with CaptureQueriesContext(connection) as full_queries:
        full = client.get(path, {"page_size": 24})
    assert full.status_code == 200
    collection = "replies" if replies_page else "roots"
    audience = "user" if signed_in else "guest"
    metric = f"comment_queries_{collection}_{audience}"
    record_testsuite_property(f"{metric}_small", len(small_queries))
    record_testsuite_property(f"{metric}_full", len(full_queries))
    assert len(full.data["results"]) == 24
    assert len(full_queries) <= len(small_queries) + 2, (
        f"Comment page SQL grew from {len(small_queries)} to {len(full_queries)} "
        f"(replies={replies_page}, signed_in={signed_in})"
    )
    assert len(full_queries) <= 15
    for item in full.data["results"]:
        assert item["author"]["avatar"]["thumbnail_id"]
        assert item["is_liked"] is signed_in
        if replies_page:
            assert str(item["parent_id"]) == str(parent.public_id)
        else:
            assert item["reply_count"] == 6
            assert len(item["replies"]) == 5
            assert all(str(reply["parent_id"]) == str(item["id"]) for reply in item["replies"])
