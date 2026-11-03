import type { Metadata } from "next";
import SavedClient from "@/components/SavedClient";

export const metadata: Metadata = { title: "সংরক্ষিত", robots: { index: false, follow: false } };

export default function SavedPage() {
  return (
    <>
      <h1 className="page-title">সংরক্ষিত</h1>
      <SavedClient />
    </>
  );
}
