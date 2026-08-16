import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { checkins, communityMembers, users } from "../../../db/schema";
import { getAppUser, avatarInitials } from "../../../lib/auth";
import { capDailyPoints } from "../../../lib/scoring";
import { toRouteErrorMessage } from "../../../lib/route-errors";

const PERIOD_TO_SQL: Record<string, string | null> = {
  Semana: "-7 days",
  Mês: "-30 days",
  Ano: "-365 days",
  Todas: null,
};

export async function GET(request: Request) {
  try {
    const user = await getAppUser();
    if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

    const url = new URL(request.url);
    const communityId = Number(url.searchParams.get("communityId"));
    const period = url.searchParams.get("period") ?? "Semana";
    if (!communityId) return Response.json({ error: "communityId é obrigatório." }, { status: 400 });
    if (!(period in PERIOD_TO_SQL)) return Response.json({ error: "Período inválido." }, { status: 400 });

    const db = getDb();
    const membership = await db
      .select()
      .from(communityMembers)
      .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, user.id)))
      .limit(1);
    if (membership.length === 0) {
      return Response.json({ error: "Você não participa dessa comunidade." }, { status: 403 });
    }

    const sinceClause = PERIOD_TO_SQL[period];
    const dateFilter = sinceClause
      ? sql`${checkins.createdAt} >= datetime('now', ${sinceClause})`
      : sql`1 = 1`;

    const rows = await db
      .select({
        userId: checkins.userId,
        userName: users.displayName,
        day: sql<string>`date(${checkins.createdAt})`,
        dayPoints: sql<number>`sum(${checkins.points})`,
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(and(eq(checkins.communityId, communityId), eq(checkins.flagged, 0), dateFilter))
      .groupBy(checkins.userId, sql`date(${checkins.createdAt})`);

    const totals = new Map<number, { name: string; points: number; wins: number }>();
    const byDay = new Map<string, { userId: number; points: number }[]>();

    for (const row of rows) {
      const capped = capDailyPoints(row.dayPoints);
      const entry = totals.get(row.userId) ?? { name: row.userName, points: 0, wins: 0 };
      entry.points += capped;
      totals.set(row.userId, entry);

      const dayEntries = byDay.get(row.day) ?? [];
      dayEntries.push({ userId: row.userId, points: capped });
      byDay.set(row.day, dayEntries);
    }

    for (const dayEntries of byDay.values()) {
      const best = dayEntries.reduce((a, b) => (b.points > a.points ? b : a));
      const entry = totals.get(best.userId);
      if (entry) entry.wins += 1;
    }

    const ranking = [...totals.entries()]
      .map(([userId, v]) => ({ userId, name: v.name, initials: avatarInitials(v.name), points: v.points, wins: v.wins }))
      .sort((a, b) => b.points - a.points);

    const topWinners = [...ranking].sort((a, b) => b.wins - a.wins).filter((r) => r.wins > 0);

    return Response.json({ ranking, topWinners });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
