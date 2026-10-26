import { getSearchIndex } from "@/lib/feed";

export const dynamic = "force-static";
export const revalidate = 600;

export async function GET() {
  const items = await getSearchIndex();
  return Response.json(items);
}
