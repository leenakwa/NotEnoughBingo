import type { Metadata } from "next";

import { BingoPlayer } from "@/features/play/bingo-player";

export const metadata: Metadata = { title: "Play bingo" };

export default async function BingoPage({ params }: { params: Promise<{ bingoId: string }> }) {
  const { bingoId } = await params;
  return <BingoPlayer bingoId={bingoId} />;
}
