import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { events, checkins, communityMembers, users } from "../../../../db/schema";
import { getAppUser, avatarInitials } from "../../../../lib/auth";
import { capDailyPoints, toSqliteTimestamp } from "../../../../lib/scoring";
import { toRouteErrorMessage } from "../../../../lib/route-errors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAppUser();
    if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const eventId = Number(id);
    if (!eventId) return Response.json({ error: "Evento inválido." }, { status: 400 });

    const db = getDb();
    const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) return Response.json({ error: "Evento não encontrado." }, { status: 404 });

    const membership = await db
      .select()
      .from(communityMembers)
      .where(and(eq(communityMembers.communityId, event.communityId), eq(communityMembers.userId, user.id)))
      .limit(1);
    if (membership.length === 0) {
      return Response.json({ error: "Você não participa dessa comunidade." }, { status: 403 });
    }

    const rows = await db
      .select({
        userId: checkins.userId,
        userName: users.displayName,
        day: sql<string>`date(${checkins.createdAt})`,
        dayPoints: sql<number>`sum(${checkins.points})`,
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(
        and(
          eq(checkins.communityId, event.communityId),
          eq(checkins.flagged, 0),
          sql`${checkins.createdAt} >= ${event.startsAt} and ${checkins.createdAt} <= ${event.endsAt}`
        )
      )
      .groupBy(checkins.userId, sql`date(${checkins.createdAt})`);

    const totals = new Map<number, { name: string; points: number }>();
    for (const row of rows) {
      const entry = totals.get(row.userId) ?? { name: row.userName, points: 0 };
      entry.points += capDailyPoints(row.dayPoints);
      totals.set(row.userId, entry);
    }

    const ranking = [...totals.entries()]
      .map(([userId, v]) => ({ userId, name: v.name, initials: avatarInitials(v.name), points: v.points }))
      .sort((a, b) => b.points - a.points);

    const nowIso = toSqliteTimestamp(new Date());
    const status = nowIso < event.startsAt ? "upcoming" : nowIso > event.endsAt ? "ended" : "active";

    return Response.json({ event: { ...event, status }, ranking });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
