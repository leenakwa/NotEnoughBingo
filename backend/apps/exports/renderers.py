from __future__ import annotations

import io
import textwrap

from django.core.files.storage import default_storage
from PIL import Image, ImageColor, ImageDraw, ImageFont, ImageOps
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from apps.bingos.models import BingoCell, BingoRevision

BOARD_PIXELS = 1800
BOARD_PADDING = 20


def _font(cell: BingoCell, size: int):
    name = "DejaVuSans"
    if cell.bold and cell.italic:
        name += "-BoldOblique"
    elif cell.bold:
        name += "-Bold"
    elif cell.italic:
        name += "-Oblique"
    try:
        return ImageFont.truetype(f"{name}.ttf", size=size)
    except OSError:
        return ImageFont.load_default(size=max(10, size))


def _open_asset(asset, size: tuple[int, int]) -> Image.Image | None:
    if not asset or not asset.is_ready or not default_storage.exists(asset.storage_key):
        return None
    try:
        with default_storage.open(asset.storage_key, "rb") as source:
            with Image.open(source) as image:
                image.load()
                return ImageOps.fit(ImageOps.exif_transpose(image).convert("RGBA"), size)
    except (OSError, ValueError):
        return None


def _draw_border(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    *,
    color: str,
    width: int,
    style: str,
) -> None:
    if width <= 0:
        return
    if style == "solid":
        draw.rectangle(box, outline=color, width=width)
        return
    if style == "double":
        draw.rectangle(box, outline=color, width=max(1, width // 3))
        inset = max(2, width)
        draw.rectangle(
            (box[0] + inset, box[1] + inset, box[2] - inset, box[3] - inset),
            outline=color,
            width=max(1, width // 3),
        )
        return
    segment = max(2, width if style == "dotted" else width * 4)
    gap = max(2, width * 2)
    for start in range(box[0], box[2], segment + gap):
        draw.line((start, box[1], min(start + segment, box[2]), box[1]), fill=color, width=width)
        draw.line((start, box[3], min(start + segment, box[2]), box[3]), fill=color, width=width)
    for start in range(box[1], box[3], segment + gap):
        draw.line((box[0], start, box[0], min(start + segment, box[3])), fill=color, width=width)
        draw.line((box[2], start, box[2], min(start + segment, box[3])), fill=color, width=width)


def render_revision_png(revision: BingoRevision) -> bytes:
    board = Image.new("RGBA", (BOARD_PIXELS, BOARD_PIXELS), "#ffffff")
    background = _open_asset(revision.background, board.size)
    if background:
        board.alpha_composite(background)
    cell_size = (BOARD_PIXELS - BOARD_PADDING * 2) // revision.size
    cells = list(revision.cells.select_related("image").order_by("position"))
    for cell in cells:
        left = BOARD_PADDING + cell.column * cell_size
        top = BOARD_PADDING + cell.row * cell_size
        right = left + cell_size
        bottom = top + cell_size
        cell_layer = Image.new("RGBA", (cell_size, cell_size), (0, 0, 0, 0))
        fill_rgb = ImageColor.getrgb(cell.background_color)
        fill_alpha = round(float(cell.background_opacity) * 255)
        ImageDraw.Draw(cell_layer).rectangle(
            (0, 0, cell_size, cell_size),
            fill=(*fill_rgb, fill_alpha),
        )
        image = _open_asset(cell.image, (cell_size, cell_size))
        if image:
            opacity = float(cell.image_opacity)
            image.putalpha(
                image.getchannel("A").point(
                    lambda alpha, opacity_factor=opacity: round(alpha * opacity_factor)
                )
            )
            cell_layer.alpha_composite(image)
        board.alpha_composite(cell_layer, (left, top))
        draw = ImageDraw.Draw(board)
        _draw_border(
            draw,
            (left, top, right, bottom),
            color=cell.border_color,
            width=cell.border_width,
            style=cell.border_style,
        )
        if cell.text:
            font_size = max(16, min(52, cell_size // 6))
            font = _font(cell, font_size)
            max_chars = max(4, int(cell_size / max(8, font_size * 0.55)))
            lines = textwrap.wrap(
                cell.text,
                width=max_chars,
                break_long_words=True,
                replace_whitespace=False,
            )[:6]
            line_boxes = [draw.textbbox((0, 0), line, font=font) for line in lines]
            line_height = max((box[3] - box[1] for box in line_boxes), default=font_size)
            total_height = line_height * len(lines) + max(0, len(lines) - 1) * 4
            y = top + (cell_size - total_height) / 2
            for line, box in zip(lines, line_boxes, strict=False):
                line_width = box[2] - box[0]
                x = left + (cell_size - line_width) / 2
                draw.text((x, y), line, font=font, fill=cell.text_color)
                if cell.underline:
                    draw.line(
                        (x, y + line_height + 1, x + line_width, y + line_height + 1),
                        fill=cell.text_color,
                        width=max(1, font_size // 14),
                    )
                if cell.strikethrough:
                    draw.line(
                        (x, y + line_height / 2, x + line_width, y + line_height / 2),
                        fill=cell.text_color,
                        width=max(1, font_size // 14),
                    )
                y += line_height + 4
    output = io.BytesIO()
    board.convert("RGB").save(output, format="PNG", optimize=True)
    return output.getvalue()


def render_revision_pdf(revision: BingoRevision) -> bytes:
    png = render_revision_png(revision)
    output = io.BytesIO()
    pdf = canvas.Canvas(output, pagesize=A4, pageCompression=1)
    page_width, page_height = A4
    margin = 36
    title_height = 36
    available = min(page_width - margin * 2, page_height - margin * 2 - title_height)
    pdf.setTitle(revision.title)
    pdf.setAuthor(revision.published_by.username)
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(margin, page_height - margin, revision.title[:100])
    pdf.drawImage(
        ImageReader(io.BytesIO(png)),
        margin,
        page_height - margin - title_height - available,
        width=available,
        height=available,
        preserveAspectRatio=True,
        mask="auto",
    )
    pdf.showPage()
    pdf.save()
    return output.getvalue()
