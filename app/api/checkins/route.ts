import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { checkins, communityMembers, drinks, users } from "../../../db/schema";
import { getAppUser, avatarInitials } from "../../../lib/auth";
import {
  CheckinValidationError,
  MIN_CHECKIN_INTERVAL_MINUTES,
  WEEKLY_RISK_THRESHOLD_G,
  gramsOfAlcohol,
  parseSqliteTimestamp,
  pointsForGrams,
  unitToMl,
} from "../../../lib/scoring";
import { moderateText, RESPONSIBLE_DRINKING_NOTICE } from "../../../lib/moderation";
import { getPhoto } from "../../../lib/photos";
import { verifyDrinkPhoto } from "../../../lib/photo-verification";
import { toRouteErrorMessage } from "../../../lib/route-errors";

export async function GET(request: Request) {
  try {
    const user = await getAppUser();
    if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

    const url = new URL(request.url);
    const communityIdParam = url.searchParams.get("communityId");
    const db = getDb();

    let scope = eq(checkins.userId, user.id);
    if (communityIdParam) {
      const communityId = Number(communityIdParam);
      const membership = await db
        .select()
        .from(communityMembers)
        .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, user.id)))
        .limit(1);
      if (membership.length === 0) {
        return Response.json({ error: "Você não participa dessa comunidade." }, { status: 403 });
      }
      scope = eq(checkins.communityId, communityId);
    }

    const rows = await db
      .select({
        id: checkins.id,
        title: checkins.title,
        description: checkins.description,
        amountRaw: checkins.amountRaw,
        unitLabel: checkins.unitLabel,
        points: checkins.points,
        photoKey: checkins.photoKey,
        photoVerified: checkins.photoVerified,
        createdAt: checkins.createdAt,
        drinkName: drinks.name,
        drinkIcon: drinks.icon,
        userName: users.displayName,
      })
      .from(checkins)
      .innerJoin(drinks, eq(checkins.drinkId, drinks.id))
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(and(scope, eq(checkins.flagged, 0)))
      .orderBy(desc(checkins.createdAt))
      .limit(50);

    return Response.json({
      checkins: rows.map((r) => ({ ...r, userInitials: avatarInitials(r.userName) })),
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
      drinkId?: number;
      amountRaw?: number;
      unitLabel?: string;
      title?: string;
      description?: string;
      photoKey?: string;
    };

    const title = payload.title?.trim();
    const photoKey = payload.photoKey?.trim();
    if (!title) return Response.json({ error: "Título é obrigatório." }, { status: 400 });
    if (!photoKey || !photoKey.startsWith(`checkins/${user.id}/`)) {
      return Response.json({ error: "Foto obrigatória." }, { status: 400 });
    }
    if (!payload.drinkId) return Response.json({ error: "Selecione uma bebida." }, { status: 400 });
    if (!payload.unitLabel || typeof payload.amountRaw !== "number") {
      return Response.json({ error: "Quantidade inválida." }, { status: 400 });
    }

    const db = getDb();

    const [drink] = await db.select().from(drinks).where(eq(drinks.id, payload.drinkId)).limit(1);
    if (!drink) return Response.json({ error: "Bebida não encontrada." }, { status: 404 });

    let amountMl: number;
    try {
      amountMl = unitToMl(payload.amountRaw, payload.unitLabel);
    } catch (error) {
      if (error instanceof CheckinValidationError) {
        return Response.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    if (payload.communityId) {
      const membership = await db
        .select()
        .from(communityMembers)
        .where(and(eq(communityMembers.communityId, payload.communityId), eq(communityMembers.userId, user.id)))
        .limit(1);
      if (membership.length === 0) {
        return Response.json({ error: "Você não participa dessa comunidade." }, { status: 403 });
      }
    }

    const [lastCheckin] = await db
      .select({ createdAt: checkins.createdAt })
      .from(checkins)
      .where(eq(checkins.userId, user.id))
      .orderBy(desc(checkins.createdAt))
      .limit(1);

    if (lastCheckin) {
      const minutesSinceLast = (Date.now() - parseSqliteTimestamp(lastCheckin.createdAt).getTime()) / 60000;
      if (minutesSinceLast < MIN_CHECKIN_INTERVAL_MINUTES) {
        const waitMinutes = Math.ceil(MIN_CHECKIN_INTERVAL_MINUTES - minutesSinceLast);
        return Response.json(
          { error: `Aguarde ${waitMinutes} min antes do próximo check-in.` },
          { status: 429 }
        );
      }
    }

    const grams = gramsOfAlcohol(amountMl, drink.abv);
    const points = pointsForGrams(grams);
    const moderation = moderateText(title, payload.description);

    // Best-effort image check — never blocks the check-in just because the
    // AI call itself failed or the binding isn't available.
    let photoVerified: number | null = null;
    try {
      const photoObject = await getPhoto(photoKey);
      if (photoObject) {
        const verification = await verifyDrinkPhoto(await photoObject.arrayBuffer());
        if (verification.verified === false) {
          return Response.json({ error: verification.reason }, { status: 400 });
        }
        photoVerified = verification.verified === true ? 1 : null;
      }
    } catch {
      // Ignore — photoVerified stays null, the check-in still goes through.
    }

    const [checkin] = await db
      .insert(checkins)
      .values({
        userId: user.id,
        communityId: payload.communityId ?? null,
        drinkId: drink.id,
        title,
        description: payload.description?.trim() || null,
        amountRaw: payload.amountRaw,
        unitLabel: payload.unitLabel,
        amountMl,
        points,
        photoKey,
        photoVerified,
        flagged: moderation.flagged ? 1 : 0,
      })
      .returning();

    const [{ weeklyPoints }] = await db
      .select({ weeklyPoints: sql<number>`coalesce(sum(${checkins.points}), 0)` })
      .from(checkins)
      .where(and(eq(checkins.userId, user.id), sql`${checkins.createdAt} >= datetime('now', '-7 days')`));

    return Response.json(
      {
        checkin,
        flagged: moderation.flagged,
        notice: RESPONSIBLE_DRINKING_NOTICE,
        wellbeingWarning: weeklyPoints > WEEKLY_RISK_THRESHOLD_G,
      },
      { status: 201 }
    );
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
