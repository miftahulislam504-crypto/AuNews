"use client";

import { useState } from "react";

// মোবাইলে ফোনের নিজস্ব শেয়ার-শিট (WhatsApp/Messenger/Facebook ইত্যাদি); না থাকলে লিংক কপি
export default function ShareButton({ title }: { title: string }) {
  const [msg, setMsg] = useState("");
  async function share() {
    const url = window.location.origin + window.location.pathname;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setMsg("লিংক কপি হয়েছে");
      setTimeout(() => setMsg(""), 2500);
    } catch {
      /* শেয়ার বাতিল করলে কিছু করার নেই */
    }
  }
  return (
    <p className="share-row">
      <button type="button" className="share-btn" onClick={share}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        শেয়ার করুন
      </button>
      <span role="status" className="share-msg">{msg}</span>
    </p>
  );
}
