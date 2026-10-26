import type { Metadata } from "next";
import SearchClient from "@/components/SearchClient";

export const metadata: Metadata = { title: "খুঁজুন" };

export default function SearchPage() {
  return (
    <>
      <h1 className="page-title">খুঁজুন</h1>
      <SearchClient />
    </>
  );
}
