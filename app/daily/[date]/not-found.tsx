import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty">
      <p>এই দিনের তালিকা পাওয়া যাচ্ছে না। পুরনো তালিকা কয়েক দিন পর সরে যায়।</p>
      <Link href="/daily" className="reader-cta inline">আজকের বড় খবর</Link>
    </div>
  );
}
