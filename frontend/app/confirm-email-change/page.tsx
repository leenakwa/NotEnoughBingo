import type { Metadata } from "next";
import { Suspense } from "react";

import { VerifyEmail } from "@/components/auth/verify-email";
import { LoadingState } from "@/components/ui/page-state";

export const metadata: Metadata = {
  title: "Confirm email change",
  robots: { index: false, follow: false },
};

export default function ConfirmEmailChangePage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <VerifyEmail mode="email-change" />
    </Suspense>
  );
}
