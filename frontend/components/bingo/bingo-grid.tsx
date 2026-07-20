import { BingoCard } from "@/components/bingo/bingo-card";
import type { BingoSummary } from "@/lib/api/types";

export function BingoGrid({ bingos }: { bingos: BingoSummary[] }) {
  return (
    <section className="bingo-grid" aria-label="Bingo boards">
      {bingos.map((bingo) => (
        <BingoCard key={bingo.id} bingo={bingo} />
      ))}
    </section>
  );
}
