from __future__ import annotations

import io
import os
import subprocess
import tempfile
from html import escape
from pathlib import Path

from django.core.files.storage import default_storage
from PIL import Image, ImageColor, ImageDraw, ImageOps
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from apps.bingos.models import BingoRevision

BOARD_PIXELS = 1800
BOARD_PADDING = 20


def _render_text(
    text: str,
    *,
    width: int,
    height: int,
    font_size: int,
    color: str = "#000000",
    bold: bool = False,
    italic: bool = False,
    underline: bool = False,
    strikethrough: bool = False,
    align: str = "center",
) -> Image.Image:
    # Pango supplies font fallback, bidi ordering and complex-script shaping.
    # Plain user text must never be interpreted as markup or shell syntax.
    text = "".join(char for char in text if ord(char) >= 32 or char in "\n\t")
    markup = escape(text, quote=False)
    if underline:
        markup = f"<u>{markup}</u>"
    if strikethrough:
        markup = f"<s>{markup}</s>"
    style = "Sans" + (" Bold" if bold else "") + (" Italic" if italic else "")
    with tempfile.TemporaryDirectory(prefix="bingo-text-") as directory:
        source = Path(directory) / "text.txt"
        output = Path(directory) / "text.png"
        source.write_text(markup, encoding="utf-8")
        while True:
            try:
                subprocess.run(  # noqa: S603 — fixed executable, no shell; text is in a file.
                    [
                        "/usr/bin/pango-view",
                        "--no-display",
                        "--pixels",
                        "--markup",
                        f"--font={style} {font_size}",
                        f"--width={width}",
                        "--wrap=word-char",
                        f"--align={align}",
                        "--margin=0",
                        "--background=transparent",
                        f"--foreground={color}",
                        f"--output={output}",
                        str(source),
                    ],
                    check=True,
                    timeout=10,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    env={**os.environ, "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"},
                )
            except (subprocess.SubprocessError, OSError):
                # Do not expose subprocess arguments, file contents or native diagnostics.
                raise RuntimeError("text_rendering_unavailable") from None
            with Image.open(output) as rendered:
                image = rendered.convert("RGBA")
            if image.height <= height or font_size == 1:
                break
            font_size = max(1, min(font_size - 1, int(font_size * height / image.height)))
    # Preserve all text, even pathological inputs with many explicit line breaks.
    if image.width > width or image.height > height:
        image.thumbnail((width, height), Image.Resampling.LANCZOS)
    return image


def _open_asset(asset, size: tuple[int, int]) -> Image.Image | None:
    if not asset or not asset.is_ready:
        return None
    if not default_storage.exists(asset.storage_key):
        raise OSError("export_image_unavailable")
    try:
        with default_storage.open(asset.storage_key, "rb") as source:
            with Image.open(source) as image:
                image.load()
                return ImageOps.fit(ImageOps.exif_transpose(image).convert("RGBA"), size)
    except (OSError, ValueError):
        # Never deliver an apparently successful export with a missing image.
        raise OSError("export_image_unavailable") from None


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
            inset = max(12, cell.border_width + 6)
            text_image = _render_text(
                cell.text,
                width=cell_size - inset * 2,
                height=cell_size - inset * 2,
                font_size=font_size,
                color=cell.text_color,
                bold=cell.bold,
                italic=cell.italic,
                underline=cell.underline,
                strikethrough=cell.strikethrough,
            )
            board.alpha_composite(
                text_image,
                (
                    left + (cell_size - text_image.width) // 2,
                    top + (cell_size - text_image.height) // 2,
                ),
            )
    output = io.BytesIO()
    board.convert("RGB").save(output, format="PNG", optimize=True)
    return output.getvalue()


def render_revision_pdf(revision: BingoRevision) -> bytes:
    png = render_revision_png(revision)
    output = io.BytesIO()
    pdf = canvas.Canvas(output, pagesize=A4, pageCompression=1)
    page_width, page_height = A4
    margin = 36
    title = _render_text(
        revision.title,
        width=round((page_width - margin * 2) * 3),
        height=108,
        font_size=48,
        bold=True,
        align="left",
    )
    title_height = title.height / 3 + 14
    available = min(page_width - margin * 2, page_height - margin * 2 - title_height)
    pdf.setTitle(revision.title)
    pdf.setAuthor(revision.published_by.username)
    pdf.drawImage(
        ImageReader(title),
        margin,
        page_height - margin - title.height / 3,
        width=title.width / 3,
        height=title.height / 3,
        mask="auto",
    )
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
