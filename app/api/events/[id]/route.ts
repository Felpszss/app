import { eq, and } from "drizzle-orm";
import { getDb } from "../../../../db";
import { events, communityMembers } from "../../../../db/schema";
import { getAppUser } from "../../../../lib/auth";
import { toSqliteTimestamp } from "../../../../lib/scoring";
import { eventStatus, computeEventRanking, validateEventFields } from "../../../../lib/events";
import { toRouteErrorMessage } from "../../../../lib/route-errors";

async function loadEventAndMembership(eventId: number, userId: number) {
  const db = getDb();
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) return { db, event: null, membership: null };

  const [membership] = await db
    .select()
    .from(communityMembers)
    .where(and(eq(communityMembers.communityId, event.communityId), eq(communityMembers.userId, userId)))
    .limit(1);
  return { db, event, membership: membership ?? null };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAppUser();
    if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const eventId = Number(id);
    if (!eventId) return Response.json({ error: "Evento inválido." }, { status: 400 });

    const { db, event, membership } = await loadEventAndMembership(eventId, user.id);
    if (!event) return Response.json({ error: "Evento não encontrado." }, { status: 404 });
    if (!membership) return Response.json({ error: "Você não participa dessa comunidade." }, { status: 403 });

    const ranking = await computeEventRanking(db, event.communityId, event.startsAt, event.endsAt);
    const status = eventStatus(event.startsAt, event.endsAt);

    return Response.json({ event: { ...event, status }, ranking });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAppUser();
    if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const eventId = Number(id);
    if (!eventId) return Response.json({ error: "Evento inválido." }, { status: 400 });

    const { db, event, membership } = await loadEventAndMembership(eventId, user.id);
    if (!event) return Response.json({ error: "Evento não encontrado." }, { status: 404 });
    if (!membership) return Response.json({ error: "Você não participa dessa comunidade." }, { status: 403 });
    if (membership.role !== "owner" && !user.isAdmin) {
      return Response.json({ error: "Somente o dono da comunidade pode editar eventos." }, { status: 403 });
    }

    const payload = (await request.json()) as { name?: string; prize?: string; startsAt?: string; endsAt?: string };
    const validated = validateEventFields(payload);
    if ("error" in validated) return Response.json({ error: validated.error }, { status: 400 });
    const { name, prize, startsAt, endsAt } = validated.fields;

    const [updated] = await db
      .update(events)
      .set({ name, prize, startsAt: toSqliteTimestamp(startsAt), endsAt: toSqliteTimestamp(endsAt) })
      .where(eq(events.id, eventId))
      .returning();

    return Response.json({ event: { ...updated, status: eventStatus(updated.startsAt, updated.endsAt) } });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAppUser();
    if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const eventId = Number(id);
    if (!eventId) return Response.json({ error: "Evento inválido." }, { status: 400 });

    const { db, event, membership } = await loadEventAndMembership(eventId, user.id);
    if (!event) return Response.json({ error: "Evento não encontrado." }, { status: 404 });
    if (!membership) return Response.json({ error: "Você não participa dessa comunidade." }, { status: 403 });
    if (membership.role !== "owner" && !user.isAdmin) {
      return Response.json({ error: "Somente o dono da comunidade pode cancelar eventos." }, { status: 403 });
    }

    await db.delete(events).where(eq(events.id, eventId));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
