import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { events, communityMembers } from "../../../db/schema";
import { getAppUser } from "../../../lib/auth";
import { toSqliteTimestamp } from "../../../lib/scoring";
import { toRouteErrorMessage } from "../../../lib/route-errors";

const MAX_EVENT_DURATION_DAYS = 30;
const MAX_EVENTS_PER_COMMUNITY = 50;

function eventStatus(startsAt: string, endsAt: string, now = new Date()): "upcoming" | "active" | "ended" {
  const nowIso = toSqliteTimestamp(now);
  if (nowIso < startsAt) return "upcoming";
  if (nowIso > endsAt) return "ended";
  return "active";
}

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

    return Response.json({
      events: rows.map((e) => ({ ...e, status: eventStatus(e.startsAt, e.endsAt) })),
    });
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
    const name = payload.name?.trim();
    const prize = payload.prize?.trim() || null;
    if (!communityId) return Response.json({ error: "communityId é obrigatório." }, { status: 400 });
    if (!name || name.length > 60) {
      return Response.json({ error: "Nome do evento é obrigatório (até 60 caracteres)." }, { status: 400 });
    }
    if (prize && prize.length > 200) {
      return Response.json({ error: "Descrição do prêmio muito longa (até 200 caracteres)." }, { status: 400 });
    }

    const startsAtDate = payload.startsAt ? new Date(payload.startsAt) : null;
    const endsAtDate = payload.endsAt ? new Date(payload.endsAt) : null;
    if (!startsAtDate || Number.isNaN(startsAtDate.getTime()) || !endsAtDate || Number.isNaN(endsAtDate.getTime())) {
      return Response.json({ error: "Datas de início e fim inválidas." }, { status: 400 });
    }
    if (endsAtDate <= startsAtDate) {
      return Response.json({ error: "A data de término deve ser depois do início." }, { status: 400 });
    }
    const durationDays = (endsAtDate.getTime() - startsAtDate.getTime()) / (1000 * 60 * 60 * 24);
    if (durationDays > MAX_EVENT_DURATION_DAYS) {
      return Response.json({ error: `Eventos podem durar no máximo ${MAX_EVENT_DURATION_DAYS} dias.` }, { status: 400 });
    }

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
        startsAt: toSqliteTimestamp(startsAtDate),
        endsAt: toSqliteTimestamp(endsAtDate),
        createdBy: user.id,
      })
      .returning();

    return Response.json({ event: { ...event, status: eventStatus(event.startsAt, event.endsAt) } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
