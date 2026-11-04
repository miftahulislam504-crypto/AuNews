import type { Metadata } from "next";
import ProfileClient from "@/components/ProfileClient";

export const metadata: Metadata = { title: "প্রোফাইল", robots: { index: false, follow: false } };

export default function ProfilePage() {
  return <ProfileClient />;
}
