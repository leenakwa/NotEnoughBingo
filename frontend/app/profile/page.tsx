import type { Metadata } from "next";

import { ProfileView } from "@/features/profile/profile-view";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};

export default function MyProfilePage() {
  return <ProfileView />;
}
