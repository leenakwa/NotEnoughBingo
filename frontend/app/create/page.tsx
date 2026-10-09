import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingState } from "@/components/ui/page-state";
import { BingoEditorRoute } from "@/features/editor/bingo-editor";

export const metadata: Metadata = {
  title: "Create bingo",
  robots: { index: false, follow: false },
};

export default function CreatePage() {
  return (
    <Suspense
      fallback={
        <main id="main-content" className="page-shell">
          <LoadingState label="Opening bingo editor…" />
        </main>
      }
    >
      <BingoEditorRoute />
    </Suspense>
  );
}
