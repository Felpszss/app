import { eq, and, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { checkins, users } from "../db/schema";
import { avatarInitials } from "./auth";
import { capDailyPoints, toSqliteTimestamp } from "./scoring";

export type EventStatus = "upcoming" | "active" | "ended";

export function eventStatus(startsAt: string, endsAt: string, now = new Date()): EventStatus {
  const nowIso = toSqliteTimestamp(now);
  if (nowIso < startsAt) return "upcoming";
  if (nowIso > endsAt) return "ended";
  return "active";
}

export const MAX_EVENT_DURATION_DAYS = 30;

export type EventFieldsInput = {
  name?: string;
  prize?: string;
  startsAt?: string;
  endsAt?: string;
};

export type ValidatedEventFields = {
  name: string;
  prize: string | null;
  startsAt: Date;
  endsAt: Date;
};

// Shared by create (POST) and edit (PATCH) — both submit the full set of
// fields, so both need the exact same checks.
export function validateEventFields(payload: EventFieldsInput): { error: string } | { fields: ValidatedEventFields } {
  const name = payload.name?.trim();
  const prize = payload.prize?.trim() || null;
  if (!name || name.length > 60) {
    return { error: "Nome do evento é obrigatório (até 60 caracteres)." };
  }
  if (prize && prize.length > 200) {
    return { error: "Descrição do prêmio muito longa (até 200 caracteres)." };
  }

  const startsAt = payload.startsAt ? new Date(payload.startsAt) : null;
  const endsAt = payload.endsAt ? new Date(payload.endsAt) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime()) || !endsAt || Number.isNaN(endsAt.getTime())) {
    return { error: "Datas de início e fim inválidas." };
  }
  if (endsAt <= startsAt) {
    return { error: "A data de término deve ser depois do início." };
  }
  const durationDays = (endsAt.getTime() - startsAt.getTime()) / (1000 * 60 * 60 * 24);
  if (durationDays > MAX_EVENT_DURATION_DAYS) {
    return { error: `Eventos podem durar no máximo ${MAX_EVENT_DURATION_DAYS} dias.` };
  }

  return { fields: { name, prize, startsAt, endsAt } };
}

export type EventRankingEntry = { userId: number; name: string; initials: string; points: number };

// Same anti-gaming shape as the community ranking (capDailyPoints per day),
// just scoped to the event's own community and time window instead of a
// rolling "last N days" period.
export async function computeEventRanking(
  db: ReturnType<typeof getDb>,
  communityId: number,
  startsAt: string,
  endsAt: string
): Promise<EventRankingEntry[]> {
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
        eq(checkins.communityId, communityId),
        eq(checkins.flagged, 0),
        sql`${checkins.createdAt} >= ${startsAt} and ${checkins.createdAt} <= ${endsAt}`
      )
    )
    .groupBy(checkins.userId, sql`date(${checkins.createdAt})`);

  const totals = new Map<number, { name: string; points: number }>();
  for (const row of rows) {
    const entry = totals.get(row.userId) ?? { name: row.userName, points: 0 };
    entry.points += capDailyPoints(row.dayPoints);
    totals.set(row.userId, entry);
  }

  return [...totals.entries()]
    .map(([userId, v]) => ({ userId, name: v.name, initials: avatarInitials(v.name), points: v.points }))
    .sort((a, b) => b.points - a.points);
}
