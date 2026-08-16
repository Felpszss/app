// Default catalog inserted once, the first time /api/drinks is read on an
// empty table. Editing existing rows afterwards happens through the admin
// endpoint, not by editing this file.
export const DRINK_SEED: { category: string; icon: string; name: string; abv: number; note?: string }[] = [
  ...group("Cervejas", "🍺", [
    ["Heineken Original", 5],
    ["Stella Artois", 5],
    ["Corona Extra", 4.6],
    ["Budweiser", 5],
    ["Brahma Duplo Malte", 4.7],
    ["Skol Pilsen", 4.7],
  ]),
  ...group("Whiskies", "🥃", [
    ["Jack Daniel's Old No. 7", 40],
    ["Johnnie Walker Red Label", 40],
    ["Chivas Regal 12", 40],
    ["Ballantine's Finest", 40],
    ["Jameson Irish Whiskey", 40],
  ]),
  ...group("Vodkas", "🍸", [
    ["Absolut Original", 40],
    ["Smirnoff No. 21", 37.5],
    ["Grey Goose", 40],
    ["Cîroc", 40],
  ]),
  ...group("Gins", "🍸", [
    ["Tanqueray London Dry", 47.3],
    ["Bombay Sapphire", 47],
    ["Gordon's London Dry", 37.5],
    ["Beefeater London Dry", 40],
  ]),
  ...group("Tequilas", "🌵", [
    ["Patrón Silver", 40],
    ["1800 Blanco", 40],
    ["Don Julio Blanco", 40],
    ["José Cuervo Especial", 38],
  ]),
  ...group("Runs", "🏴‍☠️", [
    ["Bacardí Carta Blanca", 40],
    ["Havana Club 3 Años", 40],
    ["Captain Morgan Spiced", 35],
  ]),
  { category: "Vinhos e espumantes", icon: "🍷", name: "Casillero del Diablo Cabernet", abv: 13.5 },
  { category: "Vinhos e espumantes", icon: "🍷", name: "Concha y Toro Reservado", abv: 12.5 },
  { category: "Vinhos e espumantes", icon: "🥂", name: "Chandon Réserve Brut", abv: 12 },
  { category: "Vinhos e espumantes", icon: "🥂", name: "Freixenet Cordon Negro", abv: 11.5 },
  { category: "Drinks clássicos", icon: "🍹", name: "Caipirinha", abv: 20, note: "estimado" },
  { category: "Drinks clássicos", icon: "🍸", name: "Moscow Mule", abv: 13, note: "estimado" },
  { category: "Drinks clássicos", icon: "🍹", name: "Aperol Spritz", abv: 9, note: "estimado" },
  { category: "Drinks clássicos", icon: "🍸", name: "Gin tônica", abv: 11, note: "estimado" },
  { category: "Drinks clássicos", icon: "🥃", name: "Negroni", abv: 24, note: "estimado" },
];

function group(
  category: string,
  icon: string,
  items: [string, number][]
): { category: string; icon: string; name: string; abv: number }[] {
  return items.map(([name, abv]) => ({ category, icon, name, abv }));
}
