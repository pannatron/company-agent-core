import { pushSocialPosts } from "@/lib/socialPostsSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — mirror social-posts.json posts[] → Sheet (📱 Social/Social Posts/queue) */
export async function POST() {
  try {
    return Response.json(await pushSocialPosts());
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 412 },
    );
  }
}
