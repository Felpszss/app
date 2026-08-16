import { getAppUser, avatarInitials } from "../../../lib/auth";
import { chatGPTSignOutPath } from "../../chatgpt-auth";
import { toRouteErrorMessage } from "../../../lib/route-errors";

export async function GET() {
  try {
    const user = await getAppUser();
    if (!user) return Response.json({ user: null });

    return Response.json({
      user: { ...user, initials: avatarInitials(user.displayName) },
      signOutPath: chatGPTSignOutPath("/"),
    });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
