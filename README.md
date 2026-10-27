# AuNews — পুরো প্রজেক্ট (Firebase ছাড়া)

বাংলাদেশ ও বিশ্বের সব খবর, নিজে নিজে আপডেট হয়। ফ্রি স্ট্যাক: GitHub Actions + GitHub রিপো (ডেটা রাখার জায়গা) + Vercel। কোনো Firebase, কোনো key, কোনো কার্ড লাগে না।

## কীভাবে চলে
1. GitHub Actions প্রতি ৩০ মিনিটে RSS ফিড আনে, ক্যাটাগরি ঠিক করে, একই ঘটনার খবর গ্রুপ করে।
2. ফলাফল রিপোর `data` ব্রাঞ্চে JSON ফাইল হিসেবে রাখে (প্রতিবার একটিমাত্র কমিট, তাই রিপো ভারী হয় না)।
3. Vercel এর সাইট ওই ফাইল পড়ে দেখায় (প্রতি ১০ মিনিটে নতুন করে)।
4. ৭ দিনের পুরনো খবর নিজে বাদ যায়।

## সেটআপ (ক্রমানুযায়ী)
1. এই জিপের ফাইল রিপোতে আপলোড করুন (একই নামের ফাইল ওভাররাইট হবে)।
2. GitHub → Actions → **Ingest news** → Run workflow। সবুজ টিক এলে রানের Summary তে নতুন খবরের সংখ্যা দেখাবে। এতে রিপোতে `data` নামে একটি নতুন ব্রাঞ্চ তৈরি হবে।
3. Vercel → AuNews প্রজেক্ট → Settings → Environment Variables:
   - পুরনো `FIREBASE_SERVICE_ACCOUNT_JSON` থাকলে মুছে দিন।
   - (ঐচ্ছিক) `DATA_REPO` = `আপনার-ইউজারনেম/AuNews`। না দিলে Vercel নিজের Git তথ্য থেকে নেয়।
   - রিপো **Private** হলে: `DATA_GITHUB_TOKEN` লাগবে (নিচে দেখুন)। Public হলে কিছু লাগবে না।
4. Vercel → Deployments → সর্বশেষ ডেপ্লয়ের ⋯ → **Redeploy**।
5. সাইট খুলে দেখুন। না এলে ১০ মিনিট পর রিলোড করুন।

### রিপো Private হলে টোকেন
GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token: Repository access = শুধু AuNews, Permissions → Contents = **Read-only**। টোকেনটি Vercel এ `DATA_GITHUB_TOKEN` নামে বসান।

## ঐচ্ছিক
- **AI অনুবাদ** (ইংরেজি খবরের শিরোনাম বাংলায়): GitHub Secret `GROQ_API_KEY`। সীমা ও বিস্তারিত `config/settings.json` এর `ai` অংশে।
- **ফিড যাচাই**: Actions → Validate feeds → Run workflow। Summary তে ফেল করা ফিড দেখাবে।

## সমস্যা হলে
- **Ingest এর শেষ ধাপে `403` / permission ত্রুটি:** রিপো → Settings → Actions → General → Workflow permissions → **Read and write permissions** → Save। তারপর আবার চালান।
- **সাইটে খালি:** আগে Ingest সবুজ কিনা দেখুন; তারপর রিপোতে `data` ব্রাঞ্চ আছে কিনা (Code পেজে ব্রাঞ্চ ড্রপডাউন); তারপর Vercel এ Redeploy।
- **Vercel এ `data` ব্রাঞ্চের জন্য বারবার বিল্ড:** `vercel.json` এ বন্ধ করা আছে; তবু হলে Vercel → Settings → Git এ দেখুন।
- পাবলিক রিপোতে ৬০ দিন কোনো কার্যকলাপ না থাকলে GitHub শিডিউল বন্ধ করে দিতে পারে; Actions ট্যাব থেকে আবার চালু করুন।

## আর লাগে না (চাইলে মুছে দিন)
`firebase/` ফোল্ডার, Firebase প্রজেক্ট, GitHub Secret `FIREBASE_SERVICE_ACCOUNT_JSON`। `lib/firebaseAdmin.ts` এখন খালি ফাইল।

## সেটিংস (`config/settings.json`)
- `site.name`: অ্যাপের নাম (AuNews)।
- `retention`: `days: 7`; `mode: "rolling"` (প্রতিটি খবর ৭ দিন পর বাদ) বা `"weekly_wipe"` (প্রতি ৭ দিনে সব একসাথে)।
- `ingest.windowDays: 3`: শুধু শেষ ৩ দিনের খবর নেওয়া হয়।
- `cluster.threshold: 0.45`: একই খবর গ্রুপ করার সংবেদনশীলতা।
- `snapshot`: ফিডে কয়টি খবর রাখা হবে (ক্যাটাগরি প্রতি ৮০, সর্বশেষ ১৫০)।

## ফোল্ডার
```
.github/workflows/   ingest.yml (প্রতি ৩০ মিনিট), validate-feeds.yml (হাতে চালানো)
app/ components/ lib/ public/   ওয়েবসাইট (Next.js)
ingest/              ইনজেস্ট + টেস্ট
config/              categories, sources, settings
scripts/             validate-feeds.mjs
vercel.json          data ব্রাঞ্চে Vercel বিল্ড বন্ধ
```
