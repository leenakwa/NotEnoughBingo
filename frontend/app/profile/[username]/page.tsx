import type { Metadata } from "next";

import { ProfileView } from "@/features/profile/profile-view";

export const metadata: Metadata = { title: "Profile" };

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return <ProfileView username={username} />;
}
