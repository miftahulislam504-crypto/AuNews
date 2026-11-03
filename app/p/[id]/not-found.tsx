import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty">
      <p>এই ব্রিফটি আর পাওয়া যাচ্ছে না। পুরনো ব্রিফ নিজে থেকেই সরে যায়।</p>
      <Link href="/ai" className="reader-cta inline">
        এআই ব্রিফে যান
      </Link>
    </div>
  );
}
