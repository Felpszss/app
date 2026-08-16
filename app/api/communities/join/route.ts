import { eq, and } from "drizzle-orm";
import { getDb } from "../../../../db";
import { communities, communityMembers } from "../../../../db/schema";
import { getAppUser } from "../../../../lib/auth";
import { toRouteErrorMessage } from "../../../../lib/route-errors";

export async function POST(request: Request) {
  try {
    const user = await getAppUser();
    if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

    const payload = (await request.json()) as { code?: string };
    const code = payload.code?.trim().toUpperCase();
    if (!code) return Response.json({ error: "Informe um código de convite." }, { status: 400 });

    const db = getDb();
    const [community] = await db.select().from(communities).where(eq(communities.inviteCode, code)).limit(1);
    if (!community) return Response.json({ error: "Código de convite inválido." }, { status: 404 });

    const existing = await db
      .select()
      .from(communityMembers)
      .where(and(eq(communityMembers.communityId, community.id), eq(communityMembers.userId, user.id)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(communityMembers).values({ communityId: community.id, userId: user.id, role: "member" });
    }

    return Response.json({ community });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
