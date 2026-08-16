import { requireAppUser, avatarInitials } from "../lib/auth";
import { chatGPTSignOutPath } from "./chatgpt-auth";
import HomeClient from "./home-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireAppUser("/");

  return (
    <HomeClient
      initialUser={{ ...user, initials: avatarInitials(user.displayName) }}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
