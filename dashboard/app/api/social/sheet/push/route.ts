import { pushSocialPosts, SocialPostValidationError } from "@/lib/socialPostsSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — mirror social-posts.json posts[] → Sheet (📱 Social/Social Posts/queue) */
export async function POST() {
  try {
    return Response.json(await pushSocialPosts());
  } catch (e) {
    if (e instanceof SocialPostValidationError) {
      return Response.json(
        {
          error: e.message,
          issues: e.issues,
          hint: "แก้ field ที่ขาดใน data/social-posts.json แล้ว push อีกครั้ง",
        },
        { status: 400 },
      );
    }
    return Response.json(
      { error: (e as Error).message },
      { status: 412 },
    );
  }
}
