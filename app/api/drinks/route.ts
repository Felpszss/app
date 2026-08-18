import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { drinks } from "../../../db/schema";
import { DRINK_SEED } from "../../../lib/drink-seed";
import { getAppUser } from "../../../lib/auth";
import { toRouteErrorMessage } from "../../../lib/route-errors";

export async function GET(request: Request) {
  try {
    const user = await getAppUser();
    if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

    const db = getDb();
    let rows = await db.select().from(drinks).where(eq(drinks.active, 1));
    if (rows.length === 0) {
      // D1 caps bound parameters per statement (~100), so the ~35-item seed
      // catalog has to go in over multiple inserts rather than one.
      const seedRows = DRINK_SEED.map((d) => ({ ...d, active: 1 }));
      const CHUNK_SIZE = 15;
      for (let i = 0; i < seedRows.length; i += CHUNK_SIZE) {
        await db.insert(drinks).values(seedRows.slice(i, i + CHUNK_SIZE));
      }
      rows = await db.select().from(drinks).where(eq(drinks.active, 1));
    }

    const wantsAll = new URL(request.url).searchParams.get("all") === "1";
    if (wantsAll) {
      if (!user.isAdmin) return Response.json({ error: "Apenas administradores podem ver o catálogo completo." }, { status: 403 });
      const allRows = await db.select().from(drinks);
      return Response.json({ drinks: allRows });
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
