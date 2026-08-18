"use client";

import { ChangeEvent, useEffect, useState } from "react";

type Screen =
  | "feed"
  | "ranking"
  | "communities"
  | "chat"
  | "profile"
  | "settings"
  | "checkin"
  | "drinks"
  | "quantity"
  | "events"
  | "event"
  | "catalog";

type Drink = { id: number; icon: string; name: string; abv: number; note?: string | null };
type AdminDrink = Drink & { category: string; active: number };
type DrinkGroup = { title: string; items: Drink[] };
type Community = { id: number; name: string; icon: string; inviteCode: string; memberCount: number; role?: string };
type EventStatus = "upcoming" | "active" | "ended";
type EventRankingEntry = { userId: number; name: string; initials: string; points: number };
type BeerRatsEvent = {
  id: number;
  communityId: number;
  name: string;
  prize: string | null;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  winner?: EventRankingEntry | null;
};
type FeedItem = {
  id: number;
  title: string;
  description: string | null;
  amountRaw: number;
  unitLabel: string;
  points: number;
  photoKey: string;
  photoVerified: number | null;
  createdAt: string;
  drinkName: string;
  drinkIcon: string;
  userName: string;
  userInitials: string;
};
type RankingEntry = { userId: number; name: string; initials: string; points: number; wins: number };
type AppUser = { id: number; email: string; displayName: string; isAdmin: boolean; ageConfirmed: boolean; initials: string };

const PERIODS = ["Semana", "Mês", "Ano", "Todas"];

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Erro inesperado.");
  return data as T;
}

function parseUtc(value: string): Date {
  return new Date(`${value.replace(" ", "T")}Z`);
}

function formatDayLabel(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "short" }).format(parseUtc(value));
}

function formatEventDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(
    parseUtc(value)
  );
}

const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  upcoming: "Em breve",
  active: "Rolando agora",
  ended: "Encerrado",
};

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(parseUtc(value));
}

function groupFeedByDay(items: FeedItem[]): [string, FeedItem[]][] {
  const map = new Map<string, FeedItem[]>();
  for (const item of items) {
    const key = item.createdAt.slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return [...map.entries()].map(([, list]) => [formatDayLabel(list[0].createdAt), list]);
}

export default function HomeClient({ initialUser, signOutPath }: { initialUser: AppUser; signOutPath: string }) {
  const [screen, setScreen] = useState<Screen>("feed");
  const [user, setUser] = useState<AppUser>(initialUser);
  const [confirmingAge, setConfirmingAge] = useState(false);

  const [communities, setCommunities] = useState<{ mine: Community[]; trending: Community[] } | null>(null);
  const [activeCommunityId, setActiveCommunityId] = useState<number | null>(null);
  const activeCommunity = communities?.mine.find((c) => c.id === activeCommunityId) ?? null;

  const [drinkGroups, setDrinkGroups] = useState<DrinkGroup[] | null>(null);
  const [adminDrinks, setAdminDrinks] = useState<AdminDrink[] | null>(null);

  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [period, setPeriod] = useState("Semana");
  const [ranking, setRanking] = useState<{ ranking: RankingEntry[]; topWinners: RankingEntry[] } | null>(null);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [drink, setDrink] = useState<Drink | null>(null);
  const [amount, setAmount] = useState("350");
  const [unit, setUnit] = useState("ml");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [published, setPublished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [events, setEvents] = useState<BeerRatsEvent[] | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [eventDetail, setEventDetail] = useState<{ event: BeerRatsEvent; ranking: EventRankingEntry[] } | null>(null);

  useEffect(() => {
    apiJson<{ mine: Community[]; trending: Community[] }>("/api/communities")
      .then((data) => {
        setCommunities(data);
        setActiveCommunityId((current) => current ?? data.mine[0]?.id ?? null);
      })
      .catch(() => setCommunities({ mine: [], trending: [] }));
  }, []);

  useEffect(() => {
    apiJson<{ groups: DrinkGroup[] }>("/api/drinks")
      .then((data) => setDrinkGroups(data.groups))
      .catch(() => setDrinkGroups([]));
  }, []);

  function loadFeed() {
    if (!activeCommunityId) {
      setFeed([]);
      return;
    }
    apiJson<{ checkins: FeedItem[] }>(`/api/checkins?communityId=${activeCommunityId}`)
      .then((data) => {
        setFeed(data.checkins);
        setFeedError(null);
      })
      .catch((e: Error) => setFeedError(e.message));
  }

  function loadRanking() {
    if (!activeCommunityId) return;
    apiJson<{ ranking: RankingEntry[]; topWinners: RankingEntry[] }>(
      `/api/ranking?communityId=${activeCommunityId}&period=${encodeURIComponent(period)}`
    )
      .then(setRanking)
      .catch(() => setRanking({ ranking: [], topWinners: [] }));
  }

  useEffect(() => {
    if (screen === "feed") loadFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, activeCommunityId]);

  useEffect(() => {
    if (screen === "ranking") loadRanking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, activeCommunityId, period]);

  // The score duel on the feed header needs ranking data even before the
  // ranking screen has been opened.
  useEffect(() => {
    loadRanking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCommunityId]);

  function loadEvents() {
    if (!activeCommunityId) {
      setEvents([]);
      return;
    }
    apiJson<{ events: BeerRatsEvent[] }>(`/api/events?communityId=${activeCommunityId}`)
      .then((data) => setEvents(data.events))
      .catch(() => setEvents([]));
  }

  useEffect(() => {
    if (screen === "feed" || screen === "communities" || screen === "events") loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, activeCommunityId]);

  function loadAdminDrinks() {
    apiJson<{ drinks: AdminDrink[] }>("/api/drinks?all=1")
      .then((data) => setAdminDrinks(data.drinks))
      .catch(() => setAdminDrinks([]));
  }

  useEffect(() => {
    if (screen === "catalog" && user.isAdmin) loadAdminDrinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  async function createDrinkAdmin() {
    const category = window.prompt("Categoria (ex.: Cervejas):");
    if (!category?.trim()) return;
    const name = window.prompt("Nome da bebida:");
    if (!name?.trim()) return;
    const icon = window.prompt("Ícone (um emoji):", "🍺");
    if (!icon?.trim()) return;
    const abvRaw = window.prompt("Teor alcoólico (%):", "5");
    const abv = Number(abvRaw);
    if (!Number.isFinite(abv) || abv < 0 || abv > 100) {
      window.alert("Teor alcoólico inválido.");
      return;
    }
    try {
      await apiJson("/api/drinks", {
        method: "POST",
        body: JSON.stringify({ category: category.trim(), name: name.trim(), icon: icon.trim(), abv }),
      });
      loadAdminDrinks();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao criar bebida.");
    }
  }

  async function editDrinkAdmin(drink: AdminDrink) {
    const name = window.prompt("Nome da bebida:", drink.name);
    if (!name?.trim()) return;
    const category = window.prompt("Categoria:", drink.category);
    if (!category?.trim()) return;
    const abvRaw = window.prompt("Teor alcoólico (%):", String(drink.abv));
    const abv = Number(abvRaw);
    if (!Number.isFinite(abv) || abv < 0 || abv > 100) {
      window.alert("Teor alcoólico inválido.");
      return;
    }
    try {
      await apiJson(`/api/drinks/${drink.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim(), category: category.trim(), abv }),
      });
      loadAdminDrinks();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao editar bebida.");
    }
  }

  async function toggleDrinkActive(drink: AdminDrink) {
    try {
      await apiJson(`/api/drinks/${drink.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: drink.active !== 1 }),
      });
      loadAdminDrinks();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao atualizar bebida.");
    }
  }

  function loadEventDetail() {
    if (!selectedEventId) return;
    apiJson<{ event: BeerRatsEvent; ranking: EventRankingEntry[] }>(`/api/events/${selectedEventId}`)
      .then(setEventDetail)
      .catch(() => setEventDetail(null));
  }

  useEffect(() => {
    if (screen !== "event") return;
    loadEventDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, selectedEventId]);

  function promptEventFields(defaults: { name: string; prize: string; daysUntilStart: string; durationDays: string }) {
    const name = window.prompt("Nome do evento:", defaults.name);
    if (!name?.trim()) return null;
    const prize = window.prompt("Prêmio para o topo do ranking (opcional):", defaults.prize) ?? "";
    const daysUntilStartRaw = window.prompt("Em quantos dias o evento começa?", defaults.daysUntilStart);
    if (daysUntilStartRaw === null) return null;
    const durationDaysRaw = window.prompt("Quantos dias o evento vai durar?", defaults.durationDays);
    if (durationDaysRaw === null) return null;

    const daysUntilStart = Number(daysUntilStartRaw);
    const durationDays = Number(durationDaysRaw);
    if (!Number.isFinite(daysUntilStart) || daysUntilStart < 0 || !Number.isFinite(durationDays) || durationDays <= 0) {
      window.alert("Dias inválidos.");
      return null;
    }

    const startsAt = new Date(Date.now() + daysUntilStart * 86400000);
    const endsAt = new Date(startsAt.getTime() + durationDays * 86400000);
    return { name: name.trim(), prize: prize.trim(), startsAt, endsAt };
  }

  async function createEvent() {
    if (!activeCommunityId) return;
    const fields = promptEventFields({ name: "", prize: "", daysUntilStart: "0", durationDays: "1" });
    if (!fields) return;

    try {
      await apiJson("/api/events", {
        method: "POST",
        body: JSON.stringify({
          communityId: activeCommunityId,
          name: fields.name,
          prize: fields.prize || undefined,
          startsAt: fields.startsAt.toISOString(),
          endsAt: fields.endsAt.toISOString(),
        }),
      });
      loadEvents();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao criar evento.");
    }
  }

  async function editEvent() {
    if (!eventDetail) return;
    const ev = eventDetail.event;
    const startsAtMs = parseUtc(ev.startsAt).getTime();
    const endsAtMs = parseUtc(ev.endsAt).getTime();
    const fields = promptEventFields({
      name: ev.name,
      prize: ev.prize ?? "",
      daysUntilStart: Math.max(0, Math.round((startsAtMs - Date.now()) / 86400000)).toString(),
      durationDays: Math.max(1, Math.round((endsAtMs - startsAtMs) / 86400000)).toString(),
    });
    if (!fields) return;

    try {
      await apiJson(`/api/events/${ev.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: fields.name,
          prize: fields.prize || undefined,
          startsAt: fields.startsAt.toISOString(),
          endsAt: fields.endsAt.toISOString(),
        }),
      });
      loadEventDetail();
      loadEvents();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao editar evento.");
    }
  }

  async function cancelEvent() {
    if (!eventDetail) return;
    if (!window.confirm(`Cancelar o evento "${eventDetail.event.name}"? Essa ação não pode ser desfeita.`)) return;
    try {
      await apiJson(`/api/events/${eventDetail.event.id}`, { method: "DELETE" });
      setEventDetail(null);
      setSelectedEventId(null);
      setScreen("events");
      loadEvents();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao cancelar evento.");
    }
  }

  function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  }

  async function publish() {
    if (!photoFile || !drink || submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const form = new FormData();
      form.append("photo", photoFile);
      const uploadRes = await fetch("/api/photos", { method: "POST", body: form });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) throw new Error(uploadData.error ?? "Falha ao enviar foto.");

      const result = await apiJson<{ notice: string; wellbeingWarning: boolean }>("/api/checkins", {
        method: "POST",
        body: JSON.stringify({
          communityId: activeCommunityId ?? undefined,
          drinkId: drink.id,
          amountRaw: Number(amount),
          unitLabel: unit,
          title,
          description: description || undefined,
          photoKey: uploadData.key,
        }),
      });

      setPublished(true);
      setNotice(
        result.wellbeingWarning
          ? `${result.notice} Seu consumo somado dos últimos 7 dias está alto — considere dar um tempo.`
          : null
      );
      setTimeout(() => {
        setPublished(false);
        setPhotoFile(null);
        setPhotoPreview(null);
        setDrink(null);
        setTitle("");
        setDescription("");
        setAmount("350");
        setUnit("ml");
        setScreen("feed");
        loadFeed();
        loadRanking();
      }, 1200);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  async function refreshCommunities() {
    const updated = await apiJson<{ mine: Community[]; trending: Community[] }>("/api/communities");
    setCommunities(updated);
    return updated;
  }

  async function createCommunity() {
    const name = window.prompt("Nome da nova comunidade:");
    if (!name?.trim()) return;
    try {
      const { community } = await apiJson<{ community: Community }>("/api/communities", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      await refreshCommunities();
      setActiveCommunityId(community.id);
      setScreen("feed");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao criar comunidade.");
    }
  }

  async function joinCommunity() {
    const code = window.prompt("Código de convite:");
    if (!code?.trim()) return;
    try {
      const { community } = await apiJson<{ community: Community }>("/api/communities/join", {
        method: "POST",
        body: JSON.stringify({ code: code.trim() }),
      });
      await refreshCommunities();
      setActiveCommunityId(community.id);
      setScreen("feed");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao entrar na comunidade.");
    }
  }

  async function confirmAge() {
    setConfirmingAge(true);
    try {
      const { user: updated } = await apiJson<{ user: AppUser }>("/api/me/confirm-age", {
        method: "POST",
        body: JSON.stringify({ confirmed: true }),
      });
      setUser(updated);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao confirmar.");
    } finally {
      setConfirmingAge(false);
    }
  }

  if (!user.ageConfirmed)
    return (
      <Phone>
        <div style={{ paddingTop: 70 }}>
          <section className="community-hero" style={{ textAlign: "center" }}>
            <div>
              <span style={{ fontSize: 42 }}>🔞</span>
              <h2>Conteúdo sobre bebidas alcoólicas</h2>
              <p>
                O BeerRats registra e ranqueia consumo de bebidas alcoólicas entre amigos. É
                necessário ter 18 anos ou mais para usar o app. Beba com responsabilidade.
              </p>
            </div>
            <button onClick={confirmAge} disabled={confirmingAge} style={{ width: "100%" }}>
              {confirmingAge ? "Confirmando…" : "Tenho 18 anos ou mais"}
            </button>
          </section>
          <p className="tiny-warning">
            Se você tem menos de 18 anos, não continue e saia da conta pelo{" "}
            <a href={signOutPath} style={{ color: "var(--red)" }}>
              link de logout
            </a>
            . Se o consumo de álcool for uma preocupação, procure apoio: CVV 188 (24h, gratuito).
          </p>
        </div>
      </Phone>
    );

  if (screen === "checkin")
    return (
      <Phone>
        <header className="nav-head">
          <button onClick={() => setScreen("feed")}>‹</button>
          <h1>Novo check-in</h1>
          <button className="red" onClick={publish} disabled={submitting || !photoFile || !drink}>
            {published ? "Feito ✓" : submitting ? "Enviando…" : "Publicar"}
          </button>
        </header>
        <div className="checkin-top">
          <div className="share-to">
            <div className="stack">
              <Avatar text={user.initials} />
              <span className="mini-glass">🍺</span>
            </div>
            <p>
              {activeCommunity ? `Em ${activeCommunity.name},` : "Sem comunidade,"}
              <br />
              perfil
            </p>
          </div>
          <label className="photo-picker" style={photoPreview ? { backgroundImage: `url(${photoPreview})` } : {}}>
            <input type="file" accept="image/*" capture="environment" onChange={onPhoto} />
            {!photoPreview && (
              <>
                <span>📸</span>
                <small>Foto obrigatória</small>
              </>
            )}
            <b>✎</b>
          </label>
          <div className="valid">
            <i>✓</i>
            <span>{photoPreview ? "Válido" : "Pendente"}</span>
          </div>
        </div>
        <section className="form-card text-card">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (opcional)" />
        </section>
        <section className="form-card options-card">
          <button>
            <span>▣</span>
            <b>Hora do check-in</b>
            <em>agora</em>
          </button>
          <button>
            <span>⌖</span>
            <b>Localização</b>
            <em>Nenhum</em>
          </button>
          <button onClick={() => setScreen("drinks")}>
            <span>♨</span>
            <b>Bebida</b>
            <em className={drink ? "chosen" : ""}>{drink?.name ?? "Selecionar bebida"}</em>
          </button>
        </section>
        <p className="section-label">Consumo</p>
        <section className="form-card options-card">
          <button onClick={() => setScreen("drinks")}>
            <span>⊕</span>
            <b>Selecionar bebida</b>
          </button>
          <button onClick={() => setScreen("quantity")}>
            <span>◷</span>
            <b>Quantidade</b>
            <em>
              {amount} {unit}
            </em>
          </button>
          <button className="auto-row">
            <span>✓</span>
            <b>Teor alcoólico</b>
            <em>{drink ? `automático · ${drink.abv}%${drink.note ? " aprox." : ""}` : "vem com a bebida"}</em>
          </button>
        </section>
        {formError && (
          <p className="tiny-warning" style={{ color: "var(--red)" }}>
            {formError}
          </p>
        )}
        <p className="tiny-warning">Somente bebidas alcoólicas contam pontos. Beba com responsabilidade.</p>
      </Phone>
    );

  if (screen === "drinks")
    return (
      <Phone>
        <header className="nav-head">
          <button onClick={() => setScreen("checkin")}>‹</button>
          <h1>Selecione a bebida</h1>
          <button className="muted" onClick={() => setScreen("checkin")}>
            Pular
          </button>
        </header>
        <div className="identity">
          <Avatar text={user.initials} />
          <div>
            <b>{user.displayName}</b>
            <p>Escolha o que você está bebendo.</p>
          </div>
        </div>
        <div className="drink-catalog">
          {!drinkGroups && <p className="tiny-warning">Carregando catálogo…</p>}
          {drinkGroups?.map((group) => (
            <section key={group.title}>
              <h2>{group.title}</h2>
              <div className="chips">
                {group.items.map((item) => (
                  <button
                    key={item.name}
                    className={drink?.name === item.name ? "selected" : ""}
                    onClick={() => {
                      setDrink(item);
                      setScreen("checkin");
                    }}
                  >
                    <span>{item.icon}</span>
                    <i>
                      {item.name}
                      <small>Teor preenchido pelo catálogo</small>
                    </i>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="search-dock">
          <input placeholder="Buscar marca ou bebida..." />
          <small>Favoritos</small>
          <div className="chips nowrap">
            {drinkGroups &&
              [drinkGroups[0]?.items[0], drinkGroups[1]?.items[0], drinkGroups[2]?.items[0]]
                .filter((item): item is Drink => Boolean(item))
                .map((item) => (
                  <button
                    key={item.name}
                    onClick={() => {
                      setDrink(item);
                      setScreen("checkin");
                    }}
                  >
                    {item.icon} {item.name.split(" ")[0]}
                  </button>
                ))}
          </div>
        </div>
      </Phone>
    );

  if (screen === "quantity")
    return (
      <Phone>
        <header className="nav-head">
          <button onClick={() => setScreen("checkin")}>‹</button>
          <h1>Quantidade</h1>
          <button className="red" onClick={() => setScreen("checkin")}>
            Concluir
          </button>
        </header>
        <section className="quantity-panel">
          <span>Quanto você bebeu?</span>
          <div className="amount-input">
            <input type="number" min="0" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <b>{unit}</b>
          </div>
          <p>Escolha a unidade usada no copo, lata ou garrafa.</p>
        </section>
        <section className="unit-list">
          {(
            [
              ["ml", "Mililitros", "Ex.: 350 ml"],
              ["L", "Litros", "Ex.: 1 L"],
              ["lata", "Latas", "350 ml cada"],
              ["long neck", "Long necks", "330 ml cada"],
              ["garrafa", "Garrafas", "600 ml cada"],
              ["dose", "Doses", "45 ml cada"],
              ["taça", "Taças", "150 ml cada"],
              ["copo", "Copos", "300 ml cada"],
            ] as [string, string, string][]
          ).map(([value, label, help]) => (
            <button className={unit === value ? "selected" : ""} onClick={() => setUnit(value)} key={value}>
              <span>{unit === value ? "✓" : ""}</span>
              <b>{label}</b>
              <small>{help}</small>
            </button>
          ))}
        </section>
        <p className="tiny-warning">O BeerRats converte a unidade para mililitros e combina com o teor da bebida selecionada.</p>
      </Phone>
    );

  if (screen === "profile")
    return (
      <Phone>
        <header className="profile-head">
          <button onClick={() => setScreen("feed")}>‹</button>
          <h1>Perfil</h1>
          <span />
        </header>
        <section className="profile-card">
          <Avatar text={user.initials} />
          <div>
            <h2>{user.displayName}</h2>
            <p>{user.email}</p>
          </div>
          <button aria-label="Editar perfil">✎</button>
        </section>
        <ProfileRow icon="★" label="BeerRats Pro" />
        <p className="menu-label">Suas comunidades</p>
        {communities?.mine.map((c) => (
          <ProfileRow
            key={c.id}
            icon={c.icon}
            label={c.name}
            onClick={() => {
              setActiveCommunityId(c.id);
              setScreen("feed");
            }}
          />
        ))}
        <ProfileRow icon="＋" label="Criar comunidade" onClick={createCommunity} />
        <ProfileRow icon="♙" label="Entrar em uma comunidade" onClick={joinCommunity} />
        <ProfileRow icon="⚑" label="Desafios concluídos" />
        <div className="menu-gap" />
        <ProfileRow icon="◉" label="Minhas conexões" />
        <div className="menu-gap" />
        <ProfileRow icon="⚙" label="Configurações" onClick={() => setScreen("settings")} />
        <ProfileRow icon="?" label="Ajuda e feedback" />
        <ProfileRow icon="ⓘ" label="Sobre o BeerRats" />
      </Phone>
    );

  if (screen === "settings")
    return (
      <Phone>
        <header className="profile-head">
          <button onClick={() => setScreen("profile")}>‹</button>
          <h1>Configurações</h1>
          <span />
        </header>
        <SettingsGroup
          title="Geral"
          items={[
            ["✉", "E-mail", user.email],
            ["♙", "Nome", user.displayName],
            ["⚿", "Senha", "Gerenciado pelo login do ChatGPT"],
            ["⌯", "Links sociais", ""],
          ]}
        />
        <SettingsGroup
          title="Preferências"
          items={[
            ["◫", "Unidades de consumo", "ml, L, doses e taças"],
            ["♨", "Bebidas favoritas", user.isAdmin ? "Editar catálogo" : "Somente leitura"],
            ["▣", "Histórico de check-ins", ""],
            ["文", "Idioma", "Português"],
          ]}
          onClicks={user.isAdmin ? { "Bebidas favoritas": () => setScreen("catalog") } : undefined}
        />
        <SettingsGroup
          title="Comunicações e privacidade"
          items={[
            ["♧", "Notificações via push", ""],
            ["⊘", "Contas bloqueadas", ""],
          ]}
        />
        <SettingsGroup
          title="Conta"
          items={[
            ["▱", "Gerenciar assinatura", ""],
            ["⇩", "Baixar meus dados", ""],
            ["↪", "Sair", ""],
            ["♙", "Excluir conta", "danger"],
          ]}
          onClicks={{ Sair: () => (window.location.href = signOutPath) }}
        />
      </Phone>
    );

  if (screen === "catalog") {
    if (!user.isAdmin)
      return (
        <Phone>
          <header className="nav-head">
            <button onClick={() => setScreen("settings")}>‹</button>
            <h1>Catálogo</h1>
            <span />
          </header>
          <p className="tiny-warning">Apenas administradores podem gerenciar o catálogo.</p>
        </Phone>
      );

    const groups = new Map<string, AdminDrink[]>();
    for (const d of adminDrinks ?? []) {
      const list = groups.get(d.category) ?? [];
      list.push(d);
      groups.set(d.category, list);
    }

    return (
      <Phone>
        <header className="nav-head">
          <button onClick={() => setScreen("settings")}>‹</button>
          <h1>Catálogo</h1>
          <button className="red" onClick={createDrinkAdmin}>
            ＋
          </button>
        </header>
        {!adminDrinks && <p className="tiny-warning">Carregando catálogo…</p>}
        {[...groups.entries()].map(([category, items]) => (
          <div key={category}>
            <p className="menu-label">{category}</p>
            <section className="community-list">
              {items.map((d) => (
                <div key={d.id} className="community" style={{ height: "auto", padding: "12px 16px", gap: 4 }}>
                  <i>{d.icon}</i>
                  <span>
                    <b>
                      {d.name} {d.active !== 1 && <em style={{ fontSize: 12, color: "var(--red)" }}>(inativa)</em>}
                    </b>
                    <small>{d.abv}% teor alcoólico</small>
                  </span>
                  <span style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => editDrinkAdmin(d)} style={{ border: 0, background: "transparent", color: "white", fontSize: 20 }}>
                      ✎
                    </button>
                    <button
                      onClick={() => toggleDrinkActive(d)}
                      style={{ border: 0, background: "transparent", color: d.active === 1 ? "var(--red)" : "#62c978", fontSize: 20 }}
                    >
                      {d.active === 1 ? "⏸" : "▶"}
                    </button>
                  </span>
                </div>
              ))}
            </section>
          </div>
        ))}
        <p className="tiny-warning">Bebidas desativadas somem do catálogo dos usuários, mas continuam nos check-ins já feitos.</p>
      </Phone>
    );
  }

  if (screen === "communities")
    return (
      <Phone>
        <header className="profile-head">
          <button onClick={() => setScreen("feed")}>‹</button>
          <h1>Comunidades</h1>
          <button className="header-plus" onClick={createCommunity}>
            ＋
          </button>
        </header>
        <section className="community-hero">
          <div>
            <span>🍻</span>
            <h2>Encontre sua galera</h2>
            <p>Entre em comunidades, acompanhe rankings e participe de desafios.</p>
          </div>
          <button onClick={joinCommunity}>Entrar com código</button>
        </section>
        <div className="community-actions">
          <button onClick={createCommunity}>
            <b>＋</b>
            <span>
              Criar comunidade
              <small>Convide seus amigos</small>
            </span>
          </button>
          <button onClick={joinCommunity}>
            <b>⌕</b>
            <span>
              Entrar com código
              <small>Use um convite</small>
            </span>
          </button>
          {activeCommunity && (
            <button style={{ gridColumn: "1 / -1" }} onClick={() => setScreen("events")}>
              <b>🏆</b>
              <span>
                Eventos do BeerRats
                <small>Desafios com prêmio em {activeCommunity.name}</small>
              </span>
            </button>
          )}
        </div>
        <p className="menu-label">Minhas comunidades</p>
        <section className="community-list">
          {communities?.mine.length ? (
            communities.mine.map((c) => (
              <CommunityRow
                key={c.id}
                icon={c.icon}
                name={c.name}
                meta={`${c.memberCount} membro${c.memberCount === 1 ? "" : "s"} · código ${c.inviteCode}`}
                onClick={() => {
                  setActiveCommunityId(c.id);
                  setScreen("feed");
                }}
              />
            ))
          ) : (
            <p className="tiny-warning" style={{ padding: "16px 0" }}>
              Você ainda não participa de nenhuma comunidade.
            </p>
          )}
        </section>
        <p className="menu-label">Em alta</p>
        <section className="community-list">
          {communities?.trending.map((c) => (
            <CommunityRow key={c.id} icon={c.icon} name={c.name} meta={`${c.memberCount} membro${c.memberCount === 1 ? "" : "s"}`} />
          ))}
        </section>
        <BottomNav screen={screen} setScreen={setScreen} />
      </Phone>
    );

  if (screen === "events")
    return (
      <Phone>
        <header className="nav-head">
          <button onClick={() => setScreen("communities")}>‹</button>
          <h1>Eventos</h1>
          {activeCommunity && (activeCommunity.role === "owner" || user.isAdmin) ? (
            <button className="red" onClick={createEvent}>
              ＋
            </button>
          ) : (
            <span />
          )}
        </header>
        <p className="list-title">{activeCommunity?.name ?? "Eventos"}</p>
        <section className="community-list">
          {!events && <p className="tiny-warning">Carregando eventos…</p>}
          {events?.length === 0 && (
            <p className="tiny-warning" style={{ padding: "16px 0" }}>
              Nenhum evento agendado ainda.
            </p>
          )}
          {events?.map((ev) => (
            <CommunityRow
              key={ev.id}
              icon="🏆"
              name={ev.name}
              meta={
                ev.status === "ended"
                  ? `Encerrado${ev.winner ? ` · vencedor: ${ev.winner.name} (${ev.winner.points} pts)` : ""}`
                  : `${EVENT_STATUS_LABEL[ev.status]} · ${formatEventDate(ev.startsAt)} – ${formatEventDate(ev.endsAt)}${
                      ev.prize ? ` · 🎁 ${ev.prize}` : ""
                    }`
              }
              onClick={() => {
                setSelectedEventId(ev.id);
                setScreen("event");
              }}
            />
          ))}
        </section>
        <p className="tiny-warning">
          O ranking do evento soma os pontos dos check-ins feitos dentro do período, com o mesmo limite diário do ranking normal.
        </p>
      </Phone>
    );

  if (screen === "event")
    return (
      <Phone>
        <header className="nav-head">
          <button onClick={() => setScreen("events")}>‹</button>
          <h1>{eventDetail?.event.name ?? "Evento"}</h1>
          <span />
        </header>
        {!eventDetail ? (
          <p className="tiny-warning">Carregando…</p>
        ) : (
          <>
            <section className="community-hero">
              <div>
                <span>🏆</span>
                <h2>{eventDetail.event.name}</h2>
                <p>
                  {EVENT_STATUS_LABEL[eventDetail.event.status]} · {formatEventDate(eventDetail.event.startsAt)} até{" "}
                  {formatEventDate(eventDetail.event.endsAt)}
                  {eventDetail.event.prize ? (
                    <>
                      <br />
                      🎁 Prêmio: {eventDetail.event.prize}
                    </>
                  ) : null}
                </p>
              </div>
              {activeCommunity?.id === eventDetail.event.communityId &&
                (activeCommunity.role === "owner" || user.isAdmin) && (
                  <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    <button
                      onClick={editEvent}
                      style={{
                        flex: 1,
                        height: 44,
                        border: 0,
                        borderRadius: 12,
                        background: "#00000040",
                        color: "white",
                        fontWeight: 700,
                      }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={cancelEvent}
                      style={{
                        flex: 1,
                        height: 44,
                        border: 0,
                        borderRadius: 12,
                        background: "#00000040",
                        color: "var(--red)",
                        fontWeight: 700,
                      }}
                    >
                      Cancelar evento
                    </button>
                  </div>
                )}
            </section>
            <p className="list-title">Classificação do evento</p>
            <div className="rank-card">
              {eventDetail.ranking.length === 0 && (
                <p className="tiny-warning" style={{ padding: "16px 0" }}>
                  Nenhum check-in registrado nesse evento ainda.
                </p>
              )}
              {eventDetail.ranking.map((p, i) => (
                <div className="person" key={p.userId}>
                  <Avatar text={p.initials} />
                  <span>
                    <b>
                      {p.name}
                      {p.userId === user.id ? " (você)" : ""}
                    </b>
                    <small>{p.points} pontos</small>
                  </span>
                  <em>{i + 1}º</em>
                </div>
              ))}
            </div>
          </>
        )}
      </Phone>
    );

  const myScore = ranking?.ranking.find((r) => r.userId === user.id);
  const leader = ranking?.ranking[0];

  const highlightedEvent = events?.find((ev) => {
    if (ev.status === "active") return true;
    if (ev.status === "upcoming") return parseUtc(ev.startsAt).getTime() - Date.now() <= 24 * 60 * 60 * 1000;
    return false;
  });

  return (
    <Phone>
      <header className="group-header">
        <button className="avatar-button" onClick={() => setScreen("profile")} aria-label="Abrir perfil">
          <Avatar text={user.initials} />
        </button>
        <div className="header-actions">
          <button onClick={() => setScreen("communities")}>
            ♧<i />
          </button>
          <button>•••</button>
        </div>
      </header>
      <h1 className="group-name">{(activeCommunity?.name ?? "BeerRats").toUpperCase()}</h1>
      {notice && <p className="tiny-warning">{notice}</p>}
      {screen === "feed" && highlightedEvent && (
        <button
          onClick={() => {
            setSelectedEventId(highlightedEvent.id);
            setScreen("event");
          }}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            border: 0,
            borderRadius: 14,
            background: "#33130f",
            color: "white",
            padding: "12px 16px",
            marginBottom: 14,
          }}
        >
          🏆 {highlightedEvent.status === "active" ? "Rolando agora: " : "Começa em breve: "}
          <b>{highlightedEvent.name}</b>
          {highlightedEvent.prize ? ` · 🎁 ${highlightedEvent.prize}` : ""}
        </button>
      )}
      {screen === "feed" && (
        <>
          {!activeCommunityId && (
            <section className="community-hero">
              <div>
                <span>🍻</span>
                <h2>Entre em uma comunidade</h2>
                <p>Crie ou entre em uma comunidade para começar a registrar e comparar check-ins.</p>
              </div>
              <button onClick={() => setScreen("communities")}>Ver comunidades</button>
            </section>
          )}
          {activeCommunityId && (
            <>
              <section className="hero-card">
                <div className="hero-photo">
                  <span>🍻</span>
                </div>
                <div className="score-duel">
                  <div>
                    <Avatar text={leader?.initials ?? "–"} />
                    <span>
                      <b>{leader?.points ?? 0}</b>
                      <small>{leader?.userId === user.id ? "Você" : "Líder"}</small>
                    </span>
                  </div>
                  <div>
                    <Avatar text={user.initials} />
                    <span>
                      <b>{myScore?.points ?? 0}</b>
                      <small>Você</small>
                    </span>
                  </div>
                </div>
              </section>
              <div className="timeline">
                {feedError && <p className="tiny-warning">{feedError}</p>}
                {feed === null && <p className="tiny-warning">Carregando feed…</p>}
                {feed?.length === 0 && <p className="tiny-warning">Nenhum check-in ainda. Seja o primeiro!</p>}
                {groupFeedByDay(feed ?? []).map(([day, items]) => (
                  <div className="day-block" key={day + items[0].id}>
                    <p>{day}</p>
                    {items.map((item) => (
                      <article key={item.id}>
                        <div className="feed-thumb" style={{ backgroundImage: `url(/api/photos/${item.photoKey})`, backgroundSize: "cover", backgroundPosition: "center" }}>
                          {item.drinkIcon}
                        </div>
                        <div>
                          <h3>{item.title}</h3>
                          <span>
                            <Avatar text={item.userInitials} />
                            {item.userName} · {item.points} pts{item.photoVerified === 1 ? " · 🤖✓ foto verificada" : ""}
                          </span>
                        </div>
                        <time>{formatTime(item.createdAt)}</time>
                      </article>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {screen === "ranking" &&
        (activeCommunityId ? (
          <Ranking period={period} setPeriod={setPeriod} data={ranking} userId={user.id} />
        ) : (
          <p className="tiny-warning">Entre em uma comunidade para ver o ranking.</p>
        ))}
      {screen === "chat" && (
        <section className="chat-empty">
          <span>💬</span>
          <h2>Bate-papo do grupo</h2>
          <p>Combine o próximo encontro com a galera.</p>
          <div>
            <input placeholder="Escrever mensagem..." />
            <button>↑</button>
          </div>
        </section>
      )}
      <button className="floating" aria-label="Novo check-in" onClick={() => setScreen("checkin")}>
        ＋
      </button>
      <BottomNav screen={screen} setScreen={setScreen} />
    </Phone>
  );
}

function Ranking({
  period,
  setPeriod,
  data,
  userId,
}: {
  period: string;
  setPeriod: (x: string) => void;
  data: { ranking: RankingEntry[]; topWinners: RankingEntry[] } | null;
  userId: number;
}) {
  const list = data?.ranking ?? [];
  const winners = data?.topWinners ?? [];
  return (
    <section className="ranking-screen">
      <p className="date-range">Classificação da comunidade</p>
      <div className="period-tabs">
        {PERIODS.map((p) => (
          <button className={period === p ? "active" : ""} onClick={() => setPeriod(p)} key={p}>
            {p}
          </button>
        ))}
      </div>
      <p className="list-title">Classificações</p>
      <div className="rank-card">
        {list.length === 0 && (
          <p className="tiny-warning" style={{ padding: "16px 0" }}>
            Nenhum check-in nesse período ainda.
          </p>
        )}
        {list.map((p, i) => (
          <div className="person" key={p.userId}>
            <Avatar text={p.initials} />
            <span>
              <b>
                {p.name}
                {p.userId === userId ? " (você)" : ""}
              </b>
              <small>{p.points} pontos</small>
            </span>
            <em>{i + 1}º</em>
          </div>
        ))}
      </div>
      <p className="list-title">Vitórias</p>
      <div className="rank-card">
        {winners.length === 0 && (
          <p className="tiny-warning" style={{ padding: "16px 0" }}>
            Sem vitórias registradas ainda.
          </p>
        )}
        {winners.map((p, i) => (
          <div className="person" key={p.userId}>
            <Avatar text={p.initials} />
            <span>
              <b>{p.name}</b>
              <small>
                {p.wins} vitória{p.wins === 1 ? "" : "s"} diária{p.wins === 1 ? "" : "s"}
              </small>
            </span>
            <em>{i + 1}º</em>
          </div>
        ))}
      </div>
    </section>
  );
}

function Phone({ children }: { children: React.ReactNode }) {
  return <main className="phone">{children}</main>;
}
function Avatar({ text }: { text: string }) {
  return <div className="avatar">{text}</div>;
}
function ProfileRow({ icon, label, onClick }: { icon: string; label: string; onClick?: () => void }) {
  return (
    <button className="profile-row" onClick={onClick}>
      <b>{icon}</b>
      <span>{label}</span>
      <em>›</em>
    </button>
  );
}
function SettingsGroup({
  title,
  items,
  onClicks,
}: {
  title: string;
  items: string[][];
  onClicks?: Record<string, () => void>;
}) {
  return (
    <section className="settings-group">
      <h2>{title}</h2>
      <div>
        {items.map(([icon, label, detail]) => (
          <button className={detail === "danger" ? "danger" : ""} key={label} onClick={onClicks?.[label]}>
            <b>{icon}</b>
            <span>
              {label}
              {detail && detail !== "danger" ? <small>{detail}</small> : null}
            </span>
            <em>›</em>
          </button>
        ))}
      </div>
    </section>
  );
}
function CommunityRow({ icon, name, meta, onClick }: { icon: string; name: string; meta: string; onClick?: () => void }) {
  return (
    <button className="community" onClick={onClick}>
      <i>{icon}</i>
      <span>
        <b>{name}</b>
        <small>{meta}</small>
      </span>
      <em>›</em>
    </button>
  );
}
function BottomNav({ screen, setScreen }: { screen: Screen; setScreen: (s: Screen) => void }) {
  return (
    <nav className="bottom four">
      <button className={screen === "feed" ? "active" : ""} onClick={() => setScreen("feed")}>
        <span>▣</span>
        <small>Detalhes</small>
      </button>
      <button className={screen === "ranking" ? "active" : ""} onClick={() => setScreen("ranking")}>
        <span>♙</span>
        <small>Ranking</small>
      </button>
      <button className={screen === "communities" ? "active" : ""} onClick={() => setScreen("communities")}>
        <span>♧</span>
        <small>Comunidades</small>
      </button>
      <button className={screen === "chat" ? "active" : ""} onClick={() => setScreen("chat")}>
        <span>◯</span>
        <small>Bate-papo</small>
      </button>
    </nav>
  );
}
