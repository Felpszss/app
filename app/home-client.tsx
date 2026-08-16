"use client";

import { ChangeEvent, useEffect, useState } from "react";

type Screen = "feed" | "ranking" | "communities" | "chat" | "profile" | "settings" | "checkin" | "drinks" | "quantity";

type Drink = { id: number; icon: string; name: string; abv: number; note?: string | null };
type DrinkGroup = { title: string; items: Drink[] };
type Community = { id: number; name: string; icon: string; inviteCode: string; memberCount: number };
type FeedItem = {
  id: number;
  title: string;
  description: string | null;
  amountRaw: number;
  unitLabel: string;
  points: number;
  photoKey: string;
  createdAt: string;
  drinkName: string;
  drinkIcon: string;
  userName: string;
  userInitials: string;
};
type RankingEntry = { userId: number; name: string; initials: string; points: number; wins: number };
type AppUser = { id: number; email: string; displayName: string; isAdmin: boolean; initials: string };

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
  const [user] = useState<AppUser>(initialUser);

  const [communities, setCommunities] = useState<{ mine: Community[]; trending: Community[] } | null>(null);
  const [activeCommunityId, setActiveCommunityId] = useState<number | null>(null);
  const activeCommunity = communities?.mine.find((c) => c.id === activeCommunityId) ?? null;

  const [drinkGroups, setDrinkGroups] = useState<DrinkGroup[] | null>(null);

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
            ["♨", "Bebidas favoritas", "Editar catálogo"],
            ["▣", "Histórico de check-ins", ""],
            ["文", "Idioma", "Português"],
          ]}
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

  const myScore = ranking?.ranking.find((r) => r.userId === user.id);
  const leader = ranking?.ranking[0];

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
                            {item.userName} · {item.points} pts
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
