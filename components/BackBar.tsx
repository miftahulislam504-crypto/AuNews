"use client";

import { useRouter } from "next/navigation";

export default function BackBar() {
  const router = useRouter();
  return (
    <div className="reader-bar">
      <button
        type="button"
        className="back-btn"
        onClick={() => (window.history.length > 1 ? router.back() : router.push("/ai"))}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        ফিরে যান
      </button>
    </div>
  );
}
