// দল/ক্লাবের নাম এখন ইংরেজিতেই দেখানো হয়: একাধিক নাম দিলে (যেমন সংক্ষিপ্ত নাম, পুরো নাম) প্রথম ফাঁকা-নয় এমনটি
export function teamEn(...names: string[]): string {
  return names.map((n) => n.trim()).find(Boolean) ?? "";
}
