import { LoadingState } from "@/components/ui/page-state";

export default function Loading() {
  return (
    <main id="main-content" className="page-shell">
      <h1 className="sr-only">Trending</h1>
      <LoadingState label="Loading Trending…" />
    </main>
  );
}
