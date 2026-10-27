import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty">
      <p>এই খবরটি আর পাওয়া যাচ্ছে না। নতুন খবর আসায় পুরনোটা তালিকা থেকে সরে গেছে।</p>
      <Link href="/" className="reader-cta inline">
        সর্বশেষ খবরে যান
      </Link>
    </div>
  );
}
