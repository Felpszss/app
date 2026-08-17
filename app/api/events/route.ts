import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { events, communityMembers } from "../../../db/schema";
import { getAppUser } from "../../../lib/auth";
import { toSqliteTimestamp } from "../../../lib/scoring";
import { eventStatus, computeEventRanking, validateEventFields } from "../../../lib/events";
import { toRouteErrorMessage } from "../../../lib/route-errors";

const MAX_EVENTS_PER_COMMUNITY = 50;

export async function GET(request: Request) {
  try {
    const user = await getAppUser();
    if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

    const url = new URL(request.url);
    const communityId = Number(url.searchParams.get("communityId"));
    if (!communityId) return Response.json({ error: "communityId é obrigatório." }, { status: 400 });

    const db = getDb();
    const membership = await db
      .select()
      .from(communityMembers)
      .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, user.id)))
      .limit(1);
    if (membership.length === 0) {
      return Response.json({ error: "Você não participa dessa comunidade." }, { status: 403 });
    }

    const rows = await db
      .select()
      .from(events)
      .where(eq(events.communityId, communityId))
      .orderBy(desc(events.startsAt))
      .limit(MAX_EVENTS_PER_COMMUNITY);

    const withStatus = await Promise.all(
      rows.map(async (e) => {
        const status = eventStatus(e.startsAt, e.endsAt);
        if (status !== "ended") return { ...e, status, winner: null };
        const ranking = await computeEventRanking(db, e.communityId, e.startsAt, e.endsAt);
        return { ...e, status, winner: ranking[0] ?? null };
      })
    );

    return Response.json({ events: withStatus });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAppUser();
    if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

    const payload = (await request.json()) as {
      communityId?: number;
      name?: string;
      prize?: string;
      startsAt?: string;
      endsAt?: string;
    };

    const communityId = payload.communityId;
    if (!communityId) return Response.json({ error: "communityId é obrigatório." }, { status: 400 });

    const validated = validateEventFields(payload);
    if ("error" in validated) return Response.json({ error: validated.error }, { status: 400 });
    const { name, prize, startsAt, endsAt } = validated.fields;

    const db = getDb();
    const membership = await db
      .select()
      .from(communityMembers)
      .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, user.id)))
      .limit(1);
    if (membership.length === 0) {
      return Response.json({ error: "Você não participa dessa comunidade." }, { status: 403 });
    }
    if (membership[0].role !== "owner" && !user.isAdmin) {
      return Response.json({ error: "Somente o dono da comunidade pode criar eventos." }, { status: 403 });
    }

    const [event] = await db
      .insert(events)
      .values({
        communityId,
        name,
        prize,
        startsAt: toSqliteTimestamp(startsAt),
        endsAt: toSqliteTimestamp(endsAt),
        createdBy: user.id,
      })
      .returning();

    return Response.json({ event: { ...event, status: eventStatus(event.startsAt, event.endsAt) } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
