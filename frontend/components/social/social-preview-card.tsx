import type { BingoRevision } from "@/lib/api/types";

function cellKey(cell: BingoRevision["cells"][number]): string {
  return cell.id ?? `${cell.row}:${cell.column}`;
}

export function SocialPreviewCard({
  eyebrow,
  title,
  summary,
  revision,
  selected = new Set<string>(),
}: {
  eyebrow: string;
  title: string;
  summary: string;
  revision?: BingoRevision | null;
  selected?: Set<string>;
}) {
  const size = revision?.size ?? 3;
  const cells = revision?.cells ?? [];
  const rows = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) =>
      cells.find((cell) => cell.row === row && cell.column === column),
    ),
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: 44,
        gap: 40,
        background: "#ffffff",
        color: "#0a0a0a",
        fontFamily: "monospace",
      }}
    >
      <div
        style={{
          width: 560,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{ display: "flex", fontSize: 22, letterSpacing: 3, textTransform: "uppercase" }}
          >
            {eyebrow}
          </div>
          <div style={{ display: "flex", fontSize: 58, fontWeight: 700, lineHeight: 1.02 }}>
            {title}
          </div>
          <div style={{ display: "flex", color: "#555555", fontSize: 25, lineHeight: 1.3 }}>
            {summary}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>Not Enough Bingo</div>
      </div>

      <div
        style={{
          width: 542,
          height: 542,
          display: "flex",
          flexDirection: "column",
          border: "3px solid #0a0a0a",
          background: "#ffffff",
        }}
      >
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} style={{ display: "flex", flex: 1 }}>
            {row.map((cell, columnIndex) => {
              const isSelected = cell ? selected.has(cellKey(cell)) : false;
              return (
                <div
                  key={`${rowIndex}:${columnIndex}`}
                  style={{
                    position: "relative",
                    minWidth: 0,
                    display: "flex",
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    padding: size >= 8 ? 2 : 6,
                    borderRight:
                      columnIndex < size - 1 ? "1px solid #0a0a0a" : "0 solid transparent",
                    borderBottom: rowIndex < size - 1 ? "1px solid #0a0a0a" : "0 solid transparent",
                    background: isSelected ? "#ffe900" : (cell?.background_color ?? "#ffffff"),
                    color: cell?.text_color ?? "#0a0a0a",
                    fontSize: Math.max(9, 26 - size * 1.7),
                    fontWeight: cell?.bold ? 700 : 400,
                    textAlign: "center",
                  }}
                >
                  {cell?.text || ""}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
