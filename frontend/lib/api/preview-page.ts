import type { BingoSummary, Page } from "@/lib/api/types";

/** Remove unused backend cell fields before serializing server preview props. */
export function projectPreviewPage(page: Page<BingoSummary> | null): Page<BingoSummary> | null {
  if (!page) return null;
  return {
    ...page,
    results: page.results.map((bingo) => ({
      ...bingo,
      preview: bingo.preview
        ? {
            ...bingo.preview,
            cells: bingo.preview.cells.map((cell) => {
              const previewCell: typeof cell & { position?: unknown; image_asset_id?: unknown } = {
                ...cell,
              };
              delete previewCell.position;
              delete previewCell.image_asset_id;
              return previewCell;
            }),
          }
        : bingo.preview,
    })),
  };
}
