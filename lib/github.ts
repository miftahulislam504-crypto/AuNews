// খবরের ডেটা GitHub রিপোর `data` ব্রাঞ্চে JSON ফাইল হিসেবে থাকে (ingest লেখে, সাইট পড়ে)।
export function dataRepo(): string | null {
  const explicit = process.env.DATA_REPO;
  if (explicit && explicit.includes("/")) return explicit.trim();
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const slug = process.env.VERCEL_GIT_REPO_SLUG;
  return owner && slug ? `${owner}/${slug}` : null;
}

// ফাইল না থাকলে (404) null; অন্য ত্রুটিতে exception
export async function readData<T>(path: string): Promise<T | null> {
  const repo = dataRepo();
  if (!repo) throw new Error("DATA_REPO সেট করা নেই");
  const branch = process.env.DATA_BRANCH || "data";
  const token = process.env.DATA_GITHUB_TOKEN;
  const url = token
    ? `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`
    : `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${path}`;
  const res = await fetch(url, {
    headers: token
      ? { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw+json", "X-GitHub-Api-Version": "2022-11-28" }
      : {},
    next: { revalidate: 600 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`ডেটা আনা যায়নি (${res.status}): ${path}`);
  return (await res.json()) as T;
}
