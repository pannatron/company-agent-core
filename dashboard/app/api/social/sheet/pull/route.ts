import { pullSocialPosts } from "@/lib/socialPostsSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — read Sheet → rebuild posts[] in social-posts.json */
export async function POST() {
  try {
    return Response.json(await pullSocialPosts());
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 412 },
    );
  }
}
