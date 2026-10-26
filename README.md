# AuNews — পুরো প্রজেক্ট

বাংলাদেশ ও বিশ্বের সব খবর, নিজে নিজে আপডেট হয়, কাউকে পোস্ট করতে হয় না। ফ্রি স্ট্যাক: GitHub Actions + Firebase Firestore (Spark) + Vercel (Hobby)। Android Chrome এ হোম স্ক্রিনে অ্যাপের মতো ইনস্টল হয় (PWA)।

## কী আছে
- **ইনজেস্ট** (`ingest/`): প্রতি ৩০ মিনিটে RSS ফিড → ডুপ্লিকেট বাদ → ক্যাটাগরি ঠিক → একই ঘটনা গ্রুপ → Firestore। ৭ দিনের পুরনো খবর অটো মোছে।
- **ওয়েবসাইট** (`app/`, `components/`, `lib/`): ক্যাটাগরি ট্যাব, ট্রেন্ডিং, সার্চ, সংরক্ষিত, সোর্স ফিল্টার, ডার্ক মোড, অফলাইন, ইনস্টল বাটন।
- **AI অনুবাদ** (ঐচ্ছিক): ইংরেজি খবরের শিরোনাম বাংলায় (Groq)।
- **সোর্স** (`config/sources.json`): ৫০টি RSS (বাংলাদেশ ২৩, আন্তর্জাতিক ২৭), ১০ ক্যাটাগরি।

## আপনার করণীয় (ক্রমানুযায়ী)

### ১. GitHub এ আপলোড
1. github.com এ নতুন রিপো বানান।
2. এই জিপ এক্সট্র্যাক্ট করে ভেতরের সব ফোল্ডার ও ফাইল রিপোর রুটে আপলোড করুন (Add file → Upload files)। `.github` ফোল্ডারটি অবশ্যই থাকতে হবে।
3. মোট ৫৫টি ফাইল; ব্রাউজারে একবারে ১০০টির বেশি ফাইল ওঠে না। ফোনের ব্রাউজারে ফোল্ডার আপলোড কঠিন, ডেস্কটপ ব্রাউজার ব্যবহার করুন।

### ২. ফিড যাচাই (গুরুত্বপূর্ণ)
1. GitHub → Actions → **Validate feeds** → Run workflow। ১-২ মিনিট পর রান খুলে নিচে **Summary** দেখুন।
2. ফেল করা ফিডের URL `config/sources.json` এ ঠিক করুন বা `"enabled": false` দিন। বাংলাদেশি সাইটের অনেক RSS URL অনুমান নির্ভর, ফেল করা স্বাভাবিক।
3. প্রতিটি ক্যাটাগরিতে অন্তত ১টি কাজ করা ফিড থাকা চাই (Summary র ⚠️ দেখুন)। ফেল করা তালিকা আমাকে পাঠালে আমি ঠিক করে দেব।

### ৩. Firebase
1. console.firebase.google.com → **নতুন** প্রজেক্ট (Spark/ফ্রি প্ল্যান)। অন্য অ্যাপের প্রজেক্ট ব্যবহার করবেন না, rules ওভাররাইট হবে।
2. Build → Firestore Database → Create database → **Production mode**। লোকেশন একটি এশিয়ার অঞ্চল নিন; পরে বদলানো যায় না।
3. Firestore → Rules → `firebase/firestore.rules` এর লেখা পেস্ট → Publish।
4. Project settings → Service accounts → **Generate new private key** → JSON ফাইল নামান। এটি গোপন রাখুন।

### ৪. GitHub Secret
GitHub রিপো → Settings → Secrets and variables → Actions → New repository secret:
- নাম `FIREBASE_SERVICE_ACCOUNT_JSON`, মান: ওই JSON ফাইলের পুরো লেখা।

### ৫. প্রথম ইনজেস্ট
1. Actions → **Ingest news** → Run workflow। Summary তে নতুন খবরের সংখ্যা ও ফেল করা ফিড দেখাবে।
2. Firebase Console → Firestore এ `articles`, `feeds`, `meta` কালেকশন তৈরি হয়েছে কিনা দেখুন।
3. এরপর নিজে নিজে প্রতি ৩০ মিনিটে চলবে।

### ৬. Vercel এ ওয়েবসাইট
1. vercel.com → Add New → Project → GitHub রিপো ইমপোর্ট (Framework: Next.js নিজে ধরবে)।
2. Environment Variables: নাম `FIREBASE_SERVICE_ACCOUNT_JSON`, মান ওই একই JSON।
3. Deploy। সাইট খুলে ফিড দেখুন (পেজ ১০ মিনিট পর্যন্ত পুরনো থাকতে পারে)।
4. Vercel Hobby শুধু নন-কমার্শিয়াল ব্যবহারের জন্য। বিজ্ঞাপন বা আয় শুরু করলে প্ল্যান/হোস্টিং আবার ভাবতে হবে।

### ৭. ফোনে অ্যাপ হিসেবে
Android Chrome এ সাইট খুলুন → হেডারে "ইনস্টল" দেখালে চাপুন, নাহলে মেনু (⋮) → "হোম স্ক্রিনে যোগ করুন"।

### ৮. (ঐচ্ছিক) AI অনুবাদ
1. console.groq.com এ API key বানান। সাইন-আপে কার্ড চাইলে থামুন।
2. GitHub Secret `GROQ_API_KEY` যোগ করুন (Vercel এ লাগবে না)।
3. Actions → Ingest news → Run workflow; Summary তে "AI অনুবাদ: N টি" দেখুন।
4. মডেল বদলাতে Actions Variable `GROQ_MODEL`। বন্ধ করতে Secret মুছুন বা `ai.enabled: false`।

### ৯. নিয়মিত খেয়াল
- মাসে একবার Actions → Ingest news এর শেষ রান সবুজ কিনা দেখুন।
- পাবলিক রিপোতে ৬০ দিন কোনো কার্যকলাপ না থাকলে GitHub শিডিউল বন্ধ করে দিতে পারে; Actions ট্যাব থেকে আবার চালু করুন।
- Vercel/Next.js নিরাপত্তা আপডেট নিয়ে সতর্ক করলে `package.json` এর `next` ভার্সন বাড়ান।
- Groq/Google মডেল বন্ধ করলে `GROQ_MODEL` বদলান।

## গুরুত্বপূর্ণ সেটিংস (`config/settings.json`)
- `site.name`: অ্যাপের নাম (AuNews)।
- `retention`: `days: 7`; `mode: "rolling"` (প্রতিটি খবর ৭ দিন পর মুছবে) বা `"weekly_wipe"` (প্রতি ৭ দিনে সব একসাথে)।
- `ingest.windowDays: 3`, `dailyWriteBudget: 15000` (ফ্রি কোটা ২০,০০০ রাইট/দিন)।
- `cluster.threshold: 0.45`: একই খবর গ্রুপ করার সংবেদনশীলতা (কমালে বেশি গ্রুপ, ভুল গ্রুপের ঝুঁকিও বাড়ে)।
- `ai`: Groq সীমা (দৈনিক টোকেন, ব্যাচ)।

## কী করা নেই
- পুশ নোটিফিকেশন (আপনি এখন বাদ দিয়েছেন)।
- বাংলা খবরের জন্য AI সারাংশ; ইংরেজির সারাংশ অনুবাদ ডিফল্টে বন্ধ।
- Play Store APK (PWA থেকে পরে বানানো যাবে)।
- সার্চ শুধু সাম্প্রতিক খবরে (প্রতি ক্যাটাগরির ৮০টি + সর্বশেষ ১৫০টি)।

## ফোল্ডার
```
.github/workflows/   ingest.yml (প্রতি ৩০ মিনিট), validate-feeds.yml (হাতে চালানো)
app/ components/ lib/ public/   ওয়েবসাইট (Next.js)
ingest/              ইনজেস্ট + টেস্ট (cd ingest && npm install && npm test)
config/              categories, sources, settings
firebase/            firestore.rules
scripts/             validate-feeds.mjs
```
