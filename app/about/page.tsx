import type { Metadata } from "next";
import sources from "@/config/sources.json";
import settings from "@/config/settings.json";

export const metadata: Metadata = {
  title: "আমাদের সম্পর্কে",
  description: "AuNews কীভাবে কাজ করে, এআই ব্রিফ কীভাবে লেখা হয় এবং ভুল জানানোর উপায়।",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  const count = (sources as { enabled?: boolean }[]).filter((s) => s.enabled !== false).length;
  const { contact, social } = settings.site as { contact?: string; social?: { facebook?: string; telegram?: string } };
  return (
    <article className="reader about">
      <h1 className="page-title">আমাদের সম্পর্কে</h1>
      <p>AuNews বাংলাদেশ ও বিশ্বের খবর এক জায়গায় দেখার জায়গা। আমরা মৌলিক প্রতিবেদন ছাপি না; {count}টি সংবাদমাধ্যমের প্রকাশিত শিরোনাম সংগ্রহ করে মূল সাইটের লিংকসহ দেখাই। প্রতিটি খবরের স্বত্ব সংশ্লিষ্ট সংবাদমাধ্যমের।</p>

      <h2 className="digest-h">এআই ব্রিফ কীভাবে লেখা হয়</h2>
      <p>একই ঘটনা একাধিক সংবাদমাধ্যমে এলে এআই ওই সোর্সগুলোর লেখা পড়ে নিজের ভাষায় মূল তথ্য সাজায়। প্রতিটি তথ্যের পাশে সোর্স নম্বর থাকে, আর নিচে মূল সোর্সের লিংক। সোর্সে নেই এমন সংখ্যা বা হুবহু কপি ধরা পড়লে স্বয়ংক্রিয়ভাবে ব্রিফ বাতিল হয়। সোর্সগুলো একমত না হলে সেটাও "সূত্রে অমিল" হিসেবে দেখানো হয়।</p>
      <p>এটি স্বয়ংক্রিয় ব্যবস্থা, মানুষ প্রতিটি ব্রিফ পড়ে দেখে না। তাই ভুল থাকতে পারে; গুরুত্বপূর্ণ সিদ্ধান্তের আগে মূল সোর্স দেখুন।</p>

      <h2 className="digest-h">গোপনীয়তা</h2>
      <p>আমরা বিজ্ঞাপন বা ট্র্যাকিং রাখি না। "সংরক্ষিত" খবর শুধু আপনার নিজের ডিভাইসে থাকে। খবরের ছবি মূল সংবাদমাধ্যমের সার্ভার থেকে লোড হয়।</p>

      <h2 className="digest-h">ভুল জানান / সরানোর অনুরোধ</h2>
      {contact ? (
        <p>ভুল তথ্য, সংশোধন বা কোনো লেখা সরানোর অনুরোধ জানান: <a href={`mailto:${contact}`}>{contact}</a></p>
      ) : (
        <p>যোগাযোগের ঠিকানা শীঘ্রই যোগ করা হবে।</p>
      )}
      {social?.facebook || social?.telegram ? (
        <p>
          {social.facebook ? <a href={social.facebook} target="_blank" rel="noopener noreferrer">ফেসবুক পেজ</a> : null}
          {social.facebook && social.telegram ? " · " : null}
          {social.telegram ? <a href={social.telegram} target="_blank" rel="noopener noreferrer">টেলিগ্রাম চ্যানেল</a> : null}
        </p>
      ) : null}
    </article>
  );
}
