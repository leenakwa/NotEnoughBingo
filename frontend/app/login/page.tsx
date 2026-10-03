import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { LoadingState } from "@/components/ui/page-state";

export const metadata: Metadata = {
  title: "Log in",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <LoginForm />
    </Suspense>
  );
}
