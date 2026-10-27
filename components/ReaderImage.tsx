"use client";

import { useState } from "react";

export default function ReaderImage({ src }: { src: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" referrerPolicy="no-referrer" className="reader-img" onError={() => setOk(false)} />
  );
}
