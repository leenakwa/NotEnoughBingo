import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { ProfileView } from "@/features/profile/profile-view";
import { lookupServerProfile } from "@/lib/api/server";
import { absoluteSiteUrl, shortDescription } from "@/lib/site";

type ProfilePageProps = { params: Promise<{ username: string }> };

async function requestProfile(username: string) {
  const cookieHeader = (await cookies()).toString();
  const lookup = await lookupServerProfile(username, cookieHeader);
  if (lookup.notFound) notFound();
  return lookup.data;
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { username } = await params;
  const profile = await requestProfile(username);
  if (!profile) {
    return { title: "Profile unavailable", robots: { index: false, follow: false } };
  }

  const displayName = profile.display_name || `@${profile.username}`;
  const title = `${displayName} (@${profile.username})`;
  const description = shortDescription(
    profile.bio,
    `See public bingo boards and activity from ${displayName}.`,
  );
  const canonical = absoluteSiteUrl(`/profile/${profile.username}`);
  const image = profile.avatar?.thumbnail_url ?? profile.avatar?.url ?? undefined;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      title,
      description,
      url: canonical,
      images: image ? [{ url: image, alt: `${displayName}'s avatar` }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function PublicProfilePage({ params }: ProfilePageProps) {
  const { username } = await params;
  const cookieHeader = (await cookies()).toString();
  const lookup = await lookupServerProfile(username, cookieHeader);
  if (lookup.notFound) notFound();
  return <ProfileView username={username} initialProfile={lookup.data} />;
}
