import type { Metadata } from "next";

import { SharedResultView } from "@/features/play/shared-result-view";

export const metadata: Metadata = { title: "Shared bingo result" };

export default async function SharePage({
  params,
}: {
  params: Promise<{ bingoId: string; shareId: string }>;
}) {
  const { bingoId, shareId } = await params;
  return <SharedResultView bingoId={bingoId} shareId={shareId} />;
}
