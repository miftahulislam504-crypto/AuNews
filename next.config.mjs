/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // firebase-admin ওয়েবপ্যাকে বান্ডেল না করে Node থেকেই লোড হবে
  serverExternalPackages: ["firebase-admin"],
  async headers() {
    return [
      {
        // সার্ভিস ওয়ার্কার যেন সবসময় নতুনটা ধরে
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
