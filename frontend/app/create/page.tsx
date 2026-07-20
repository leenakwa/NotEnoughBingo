import type { Metadata } from "next";

import { BingoEditor } from "@/features/editor/bingo-editor";

export const metadata: Metadata = { title: "Create bingo" };

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ bingo?: string }>;
}) {
  const { bingo } = await searchParams;
  return <BingoEditor bingoId={bingo} />;
}
