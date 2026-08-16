import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { drinks } from "../../../db/schema";
import { DRINK_SEED } from "../../../lib/drink-seed";
import { getAppUser } from "../../../lib/auth";
import { toRouteErrorMessage } from "../../../lib/route-errors";

export async function GET() {
  try {
    const user = await getAppUser();
    if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

    const db = getDb();
    let rows = await db.select().from(drinks).where(eq(drinks.active, 1));
    if (rows.length === 0) {
      await db.insert(drinks).values(DRINK_SEED.map((d) => ({ ...d, active: 1 })));
      rows = await db.select().from(drinks).where(eq(drinks.active, 1));
    }

    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = groups.get(row.category) ?? [];
      list.push(row);
      groups.set(row.category, list);
    }

    return Response.json({
      groups: [...groups.entries()].map(([title, items]) => ({ title, items })),
    });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAppUser();
    if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!user.isAdmin) return Response.json({ error: "Apenas administradores podem editar o catálogo." }, { status: 403 });

    const payload = (await request.json()) as {
      category?: string;
      icon?: string;
      name?: string;
      abv?: number;
      note?: string;
    };
    const category = payload.category?.trim();
    const icon = payload.icon?.trim();
    const name = payload.name?.trim();
    const abv = payload.abv;

    if (!category || !icon || !name || typeof abv !== "number" || abv < 0 || abv > 100) {
      return Response.json({ error: "Categoria, ícone, nome e teor alcoólico (0-100) são obrigatórios." }, { status: 400 });
    }

    const db = getDb();
    const [drink] = await db
      .insert(drinks)
      .values({ category, icon, name, abv, note: payload.note?.trim() || null })
      .returning();

    return Response.json({ drink }, { status: 201 });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
