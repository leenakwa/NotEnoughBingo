import type { CSSProperties } from "react";

import type { BingoCardPreview as BingoCardPreviewData, RevisionCell } from "@/lib/api/types";

interface PreviewStyle extends CSSProperties {
  "--preview-font-size": string;
  "--preview-size": number;
}

function cellStyle(cell: RevisionCell): CSSProperties {
  return {
    color: cell.text_color,
    borderColor: cell.border_color,
    borderWidth: `${Math.min(cell.border_width, 2)}px`,
    borderStyle: cell.border_style,
  };
}

export function BingoCardPreview({
  preview,
  fallbackSize,
  title,
}: {
  preview: BingoCardPreviewData | null;
  fallbackSize: number;
  title: string;
}) {
  const size = preview?.size ?? fallbackSize;
  const cells = preview
    ? [...preview.cells].sort((left, right) => left.row - right.row || left.column - right.column)
    : [];
  const style: PreviewStyle = {
    "--preview-font-size": `${Math.max(0.3, Math.min(0.82, 1.08 - size * 0.075))}rem`,
    "--preview-size": size,
    backgroundImage: preview?.board_background?.url
      ? `url("${preview.board_background.url}")`
      : undefined,
  };

  return (
    <div
      className="bingo-card-preview"
      role="img"
      aria-label={`Preview of ${title}, ${size} by ${size} bingo`}
      style={style}
    >
      {cells.length
        ? cells.map((cell) => (
            <span
              key={cell.id ?? `${cell.row}:${cell.column}`}
              className="bingo-card-preview__cell"
              style={cellStyle(cell)}
              aria-hidden="true"
            >
              <span
                className="bingo-card-preview__background"
                style={{
                  backgroundColor: cell.background_color,
                  opacity: cell.background_opacity,
                }}
              />
              {cell.image?.url ? (
                <span
                  className="bingo-card-preview__image"
                  style={{
                    backgroundImage: `url("${cell.image.url}")`,
                    opacity: cell.image_opacity,
                  }}
                />
              ) : null}
              <span
                className="bingo-card-preview__text"
                style={{
                  fontWeight: cell.bold ? 700 : 400,
                  fontStyle: cell.italic ? "italic" : "normal",
                  textDecoration: [
                    cell.underline ? "underline" : "",
                    cell.strikethrough ? "line-through" : "",
                  ]
                    .filter(Boolean)
                    .join(" "),
                }}
              >
                {cell.text}
              </span>
            </span>
          ))
        : Array.from({ length: size * size }, (_, index) => (
            <span key={index} className="bingo-card-preview__cell" aria-hidden="true" />
          ))}
    </div>
  );
}
