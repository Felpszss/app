import { eq, sql, desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { communities, communityMembers } from "../../../db/schema";
import { getAppUser } from "../../../lib/auth";
import { toRouteErrorMessage } from "../../../lib/route-errors";

function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function GET() {
  try {
    const user = await getAppUser();
    if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

    const db = getDb();

    const memberships = await db
      .select({
        community: communities,
        role: communityMembers.role,
        memberCount: sql<number>`(select count(*) from ${communityMembers} cm where cm.community_id = ${communities.id})`,
      })
      .from(communityMembers)
      .innerJoin(communities, eq(communityMembers.communityId, communities.id))
      .where(eq(communityMembers.userId, user.id));

    const myCommunityIds = memberships.map((m) => m.community.id);

    const trendingRaw = await db
      .select({ community: communities, memberCount: sql<number>`count(${communityMembers.id})`.as("member_count") })
      .from(communities)
      .leftJoin(communityMembers, eq(communityMembers.communityId, communities.id))
      .groupBy(communities.id)
      .orderBy(desc(sql`member_count`))
      .limit(10);

    const trending = trendingRaw.filter((t) => !myCommunityIds.includes(t.community.id)).slice(0, 5);

    return Response.json({
      mine: memberships.map((m) => ({ ...m.community, memberCount: m.memberCount, role: m.role })),
      trending: trending.map((t) => ({ ...t.community, memberCount: t.memberCount })),
    });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAppUser();
    if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

    const payload = (await request.json()) as { name?: string; icon?: string };
    const name = payload.name?.trim();
    if (!name || name.length > 60) {
      return Response.json({ error: "Nome da comunidade é obrigatório (até 60 caracteres)." }, { status: 400 });
    }

    const db = getDb();
    let inviteCode = generateInviteCode();
    for (let attempts = 0; attempts < 5; attempts++) {
      const clash = await db.select().from(communities).where(eq(communities.inviteCode, inviteCode)).limit(1);
      if (clash.length === 0) break;
      inviteCode = generateInviteCode();
    }

    const [community] = await db
      .insert(communities)
      .values({ name, icon: payload.icon?.trim() || "🍻", inviteCode, createdBy: user.id })
      .returning();

    await db.insert(communityMembers).values({ communityId: community.id, userId: user.id, role: "owner" });

    return Response.json({ community }, { status: 201 });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
