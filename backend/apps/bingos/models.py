from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.common.models import PublicIdModel, SoftDeleteModel, TimeStampedModel


class BingoQuerySet(models.QuerySet):
    def live(self):
        return self.filter(deleted_at__isnull=True)

    def public_catalog(self):
        return self.live().filter(
            status=Bingo.Status.PUBLISHED,
            visibility=Bingo.Visibility.PUBLIC,
            hidden_at__isnull=True,
            current_revision__isnull=False,
        )

    def accessible_to(self, user):
        public_link_content = Q(
            status=Bingo.Status.PUBLISHED,
            visibility__in=(Bingo.Visibility.PUBLIC, Bingo.Visibility.UNLISTED),
            hidden_at__isnull=True,
            current_revision__isnull=False,
        )
        if user and user.is_authenticated:
            if user.has_perm("moderation.view_private_content"):
                return self.live()
            return self.live().filter(public_link_content | Q(author=user))
        return self.live().filter(public_link_content)


class Bingo(PublicIdModel, TimeStampedModel, SoftDeleteModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    class Visibility(models.TextChoices):
        PUBLIC = "public", "Public"
        UNLISTED = "unlisted", "Unlisted"
        PRIVATE = "private", "Private"

    class MarkingStyle(models.TextChoices):
        CHECKMARK = "checkmark", "Checkmark"
        CROSSOUT = "crossout", "Crossout"
        HIGHLIGHT = "highlight", "Highlight"

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="bingos",
    )
    title = models.CharField(max_length=70, blank=True)
    description = models.CharField(max_length=1000, blank=True)
    size = models.PositiveSmallIntegerField(default=5)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    visibility = models.CharField(
        max_length=16,
        choices=Visibility.choices,
        default=Visibility.PRIVATE,
        db_index=True,
    )
    marking_style = models.CharField(
        max_length=16,
        choices=MarkingStyle.choices,
        default=MarkingStyle.CHECKMARK,
    )
    marking_config = models.JSONField(default=dict, blank=True)
    cover = models.ForeignKey(
        "media_assets.MediaAsset",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="bingo_covers",
    )
    background = models.ForeignKey(
        "media_assets.MediaAsset",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="bingo_backgrounds",
    )
    current_revision = models.ForeignKey(
        "BingoRevision",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="current_for_bingos",
    )
    published_at = models.DateTimeField(null=True, blank=True, db_index=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    hidden_at = models.DateTimeField(null=True, blank=True, db_index=True)
    hidden_reason = models.CharField(max_length=500, blank=True)
    view_count = models.PositiveBigIntegerField(default=0)
    like_count = models.PositiveBigIntegerField(default=0)
    comment_count = models.PositiveBigIntegerField(default=0)
    play_count = models.PositiveBigIntegerField(default=0)
    share_count = models.PositiveBigIntegerField(default=0)
    trending_score = models.FloatField(default=0, db_index=True)
    trending_score_updated_at = models.DateTimeField(null=True, blank=True)
    tags = models.ManyToManyField("Tag", through="BingoTag", related_name="bingos")

    objects = BingoQuerySet.as_manager()

    class Meta:
        ordering = ("-published_at", "-created_at")
        constraints = [
            models.CheckConstraint(
                condition=Q(size__gte=3, size__lte=10),
                name="bingo_size_between_3_and_10",
            ),
        ]
        indexes = [
            models.Index(fields=("author", "status", "-updated_at")),
            models.Index(fields=("visibility", "status", "hidden_at", "-published_at")),
            models.Index(fields=("status", "-trending_score", "-published_at")),
        ]

    def __str__(self) -> str:
        return self.title or f"Untitled {self.public_id}"

    @property
    def is_publicly_listed(self) -> bool:
        return (
            self.status == self.Status.PUBLISHED
            and self.visibility == self.Visibility.PUBLIC
            and self.hidden_at is None
            and self.deleted_at is None
        )


class Draft(PublicIdModel, TimeStampedModel):
    bingo = models.OneToOneField(Bingo, on_delete=models.CASCADE, related_name="draft")
    based_on_revision = models.ForeignKey(
        "BingoRevision",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="derived_drafts",
    )
    document = models.JSONField(default=dict)
    schema_version = models.PositiveSmallIntegerField(default=1)
    version = models.PositiveIntegerField(default=1)
    saved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="saved_bingo_drafts",
    )

    class Meta:
        ordering = ("-updated_at",)
        constraints = [
            models.CheckConstraint(
                condition=Q(version__gte=1),
                name="draft_version_positive",
            )
        ]
        indexes = [models.Index(fields=("saved_by", "-updated_at"))]


class DraftMediaAsset(TimeStampedModel):
    draft = models.ForeignKey(
        Draft,
        on_delete=models.CASCADE,
        related_name="media_links",
    )
    asset = models.ForeignKey(
        "media_assets.MediaAsset",
        on_delete=models.PROTECT,
        related_name="draft_references",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("draft", "asset"),
                name="unique_draft_media_asset",
            )
        ]
        indexes = [models.Index(fields=("asset", "draft"))]


class BingoRevision(PublicIdModel, TimeStampedModel):
    bingo = models.ForeignKey(Bingo, on_delete=models.CASCADE, related_name="revisions")
    revision_number = models.PositiveIntegerField()
    title = models.CharField(max_length=70)
    description = models.CharField(max_length=1000, blank=True)
    size = models.PositiveSmallIntegerField()
    visibility = models.CharField(max_length=16, choices=Bingo.Visibility.choices)
    marking_style = models.CharField(max_length=16, choices=Bingo.MarkingStyle.choices)
    marking_config = models.JSONField(default=dict, blank=True)
    cover = models.ForeignKey(
        "media_assets.MediaAsset",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="revision_covers",
    )
    background = models.ForeignKey(
        "media_assets.MediaAsset",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="revision_backgrounds",
    )
    schema_version = models.PositiveSmallIntegerField(default=1)
    document_hash = models.CharField(max_length=64)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="published_bingo_revisions",
    )
    published_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ("bingo", "-revision_number")
        constraints = [
            models.UniqueConstraint(
                fields=("bingo", "revision_number"),
                name="unique_bingo_revision_number",
            ),
            models.CheckConstraint(
                condition=Q(size__gte=3, size__lte=10),
                name="revision_size_between_3_and_10",
            ),
        ]
        indexes = [models.Index(fields=("bingo", "-revision_number"))]

    def __str__(self) -> str:
        return f"{self.bingo_id} revision {self.revision_number}"

    def save(self, *args, **kwargs) -> None:
        if self.pk and not self._state.adding:
            raise RuntimeError("Published bingo revisions are immutable.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError("Published bingo revisions cannot be deleted directly.")


class BingoCell(models.Model):
    class BorderStyle(models.TextChoices):
        SOLID = "solid", "Solid"
        DASHED = "dashed", "Dashed"
        DOTTED = "dotted", "Dotted"
        DOUBLE = "double", "Double"

    revision = models.ForeignKey(
        BingoRevision,
        on_delete=models.CASCADE,
        related_name="cells",
    )
    public_id = models.UUIDField(default=uuid.uuid4, editable=False)
    row = models.PositiveSmallIntegerField()
    column = models.PositiveSmallIntegerField()
    position = models.PositiveSmallIntegerField()
    text = models.CharField(max_length=100, blank=True)
    text_color = models.CharField(max_length=7, default="#000000")
    bold = models.BooleanField(default=False)
    italic = models.BooleanField(default=False)
    underline = models.BooleanField(default=False)
    strikethrough = models.BooleanField(default=False)
    background_color = models.CharField(max_length=7, default="#ffffff")
    background_opacity = models.DecimalField(max_digits=4, decimal_places=3, default=1)
    image = models.ForeignKey(
        "media_assets.MediaAsset",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="revision_cells",
    )
    image_opacity = models.DecimalField(max_digits=4, decimal_places=3, default=1)
    border_color = models.CharField(max_length=7, default="#000000")
    border_width = models.PositiveSmallIntegerField(default=1)
    border_style = models.CharField(
        max_length=12,
        choices=BorderStyle.choices,
        default=BorderStyle.SOLID,
    )

    class Meta:
        ordering = ("position",)
        constraints = [
            models.UniqueConstraint(
                fields=("revision", "row", "column"),
                name="unique_revision_cell_coordinate",
            ),
            models.UniqueConstraint(
                fields=("revision", "position"),
                name="unique_revision_cell_position",
            ),
            models.UniqueConstraint(
                fields=("revision", "public_id"),
                name="unique_revision_cell_public_id",
            ),
            models.CheckConstraint(
                condition=Q(background_opacity__gte=0, background_opacity__lte=1),
                name="cell_background_opacity_range",
            ),
            models.CheckConstraint(
                condition=Q(image_opacity__gte=0, image_opacity__lte=1),
                name="cell_image_opacity_range",
            ),
            models.CheckConstraint(
                condition=Q(border_width__lte=12),
                name="cell_border_width_max_12",
            ),
        ]
        indexes = [models.Index(fields=("revision", "position"))]

    def __str__(self) -> str:
        return f"{self.revision_id}:{self.row},{self.column}"

    def save(self, *args, **kwargs) -> None:
        if self.pk and not self._state.adding:
            raise RuntimeError("Published bingo cells are immutable.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError("Published bingo cells cannot be deleted directly.")


class Tag(PublicIdModel, TimeStampedModel):
    name = models.CharField(max_length=50)
    slug = models.SlugField(max_length=60, unique=True, allow_unicode=True)
    hidden_at = models.DateTimeField(null=True, blank=True, db_index=True)
    usage_count = models.PositiveBigIntegerField(default=0)

    class Meta:
        ordering = ("name",)
        indexes = [models.Index(fields=("hidden_at", "-usage_count", "name"))]

    def __str__(self) -> str:
        return self.name


class BingoTag(models.Model):
    bingo = models.ForeignKey(Bingo, on_delete=models.CASCADE, related_name="tag_links")
    tag = models.ForeignKey(Tag, on_delete=models.PROTECT, related_name="bingo_links")
    position = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("position",)
        constraints = [
            models.UniqueConstraint(fields=("bingo", "tag"), name="unique_bingo_tag"),
            models.UniqueConstraint(
                fields=("bingo", "position"),
                name="unique_bingo_tag_position",
            ),
            models.CheckConstraint(
                condition=Q(position__lt=15),
                name="bingo_tag_position_under_15",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.bingo_id}:{self.tag}"


class BingoRevisionTag(models.Model):
    revision = models.ForeignKey(
        BingoRevision,
        on_delete=models.CASCADE,
        related_name="revision_tags",
    )
    tag = models.ForeignKey(
        Tag,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="revision_snapshots",
    )
    name = models.CharField(max_length=50)
    slug = models.SlugField(max_length=60)
    position = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ("position",)
        constraints = [
            models.UniqueConstraint(
                fields=("revision", "position"),
                name="unique_revision_tag_position",
            )
        ]

    def __str__(self) -> str:
        return f"{self.revision_id}:{self.name}"
