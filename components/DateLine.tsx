"use client";

import { useEffect, useState } from "react";

function label(): string {
  return new Date().toLocaleDateString("bn-BD", {
    timeZone: "Asia/Dhaka",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// আজকের তারিখ (ক্লায়েন্টে বসে, যাতে স্ট্যাটিক পেজে পুরনো তারিখ না থাকে)
export default function DateLine() {
  const [text, setText] = useState("");
  useEffect(() => setText(label()), []);
  return <span className="dateline">{text}</span>;
}
