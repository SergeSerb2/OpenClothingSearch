/**
 * Clothing (v2) mock data for `?mock=1`: the catalog, garment placeholder images, a result
 * generator for clothing searches, AI stylist suggestions and "shop the look" detection.
 *
 * Special inputs in mock mode:
 *   stylist notes "fail" -> error, "nothing" -> no suggestions
 *   look photo whose file name contains "fail" -> error, "empty" -> no items found
 */
import type {
  Box,
  Brand,
  Catalog,
  Category,
  Color,
  Group,
  Listing,
  LookItem,
  Method,
  Named,
  Profile,
  Queries,
  SearchOptions,
  Source,
  Style,
  SuggestItem,
  Suggestions,
  Tier,
} from "../api/types";

// ---------------------------------------------------------------------------
// Catalog

const categories: Category[] = [
  { id: "tee", name: "T-shirt", zh: "T恤", group: "tops" },
  { id: "shirt", name: "Shirt", zh: "衬衫", group: "tops" },
  { id: "polo", name: "Polo", zh: "Polo衫", group: "tops" },
  { id: "hoodie", name: "Hoodie", zh: "连帽卫衣", group: "tops" },
  { id: "sweatshirt", name: "Sweatshirt", zh: "圆领卫衣", group: "tops" },
  { id: "sweater", name: "Sweater", zh: "毛衣", group: "tops" },
  { id: "shell-jacket", name: "Shell jacket", zh: "冲锋衣", group: "outerwear" },
  { id: "puffer", name: "Puffer jacket", zh: "羽绒服", group: "outerwear" },
  { id: "fleece", name: "Fleece", zh: "抓绒衣", group: "outerwear" },
  { id: "bomber", name: "Bomber jacket", zh: "飞行员夹克", group: "outerwear" },
  { id: "denim-jacket", name: "Denim jacket", zh: "牛仔外套", group: "outerwear" },
  { id: "coat", name: "Coat", zh: "大衣", group: "outerwear" },
  { id: "blazer", name: "Blazer", zh: "西装外套", group: "outerwear" },
  { id: "jeans", name: "Jeans", zh: "牛仔裤", group: "bottoms" },
  { id: "cargo-pants", name: "Cargo pants", zh: "工装裤", group: "bottoms" },
  { id: "trousers", name: "Trousers", zh: "休闲裤", group: "bottoms" },
  { id: "sweatpants", name: "Sweatpants", zh: "卫裤", group: "bottoms" },
  { id: "shorts", name: "Shorts", zh: "短裤", group: "bottoms" },
  { id: "skirt", name: "Skirt", zh: "半身裙", group: "bottoms" },
  { id: "sneakers", name: "Sneakers", zh: "运动鞋", group: "shoes" },
  { id: "trail-shoes", name: "Trail shoes", zh: "越野跑鞋", group: "shoes" },
  { id: "boots", name: "Boots", zh: "靴子", group: "shoes" },
  { id: "loafers", name: "Loafers", zh: "乐福鞋", group: "shoes" },
  { id: "backpack", name: "Backpack", zh: "双肩包", group: "bags" },
  { id: "tote", name: "Tote bag", zh: "托特包", group: "bags" },
  { id: "crossbody", name: "Crossbody bag", zh: "斜挎包", group: "bags" },
  { id: "cap", name: "Cap", zh: "棒球帽", group: "accessories" },
  { id: "beanie", name: "Beanie", zh: "毛线帽", group: "accessories" },
  { id: "scarf", name: "Scarf", zh: "围巾", group: "accessories" },
  { id: "belt", name: "Belt", zh: "腰带", group: "accessories" },
];

const colors: Color[] = [
  { id: "black", name: "Black", zh: "黑色", hex: "#16161a" },
  { id: "white", name: "White", zh: "白色", hex: "#f6f5f1" },
  { id: "grey", name: "Grey", zh: "灰色", hex: "#9b9c9e" },
  { id: "charcoal", name: "Charcoal", zh: "炭灰", hex: "#3d3f43" },
  { id: "navy", name: "Navy", zh: "藏青", hex: "#1f2a44" },
  { id: "cream", name: "Cream", zh: "奶白", hex: "#eee4cf" },
  { id: "beige", name: "Beige", zh: "米色", hex: "#d6c4a1" },
  { id: "brown", name: "Brown", zh: "棕色", hex: "#6c4a2f" },
  { id: "olive", name: "Olive", zh: "橄榄绿", hex: "#5b6334" },
  { id: "green", name: "Green", zh: "绿色", hex: "#2e6a3c" },
  { id: "light-blue", name: "Light blue", zh: "浅蓝", hex: "#9fc1e0" },
  { id: "blue", name: "Blue", zh: "蓝色", hex: "#2f5eb2" },
  { id: "red", name: "Red", zh: "红色", hex: "#b5302e" },
  { id: "pink", name: "Pink", zh: "粉色", hex: "#e6a7b5" },
  { id: "yellow", name: "Yellow", zh: "黄色", hex: "#e0bd42" },
  { id: "orange", name: "Orange", zh: "橙色", hex: "#de772d" },
  { id: "purple", name: "Purple", zh: "紫色", hex: "#6a4f9e" },
];

const fits: Named[] = [
  { id: "regular", name: "Regular", zh: "常规" },
  { id: "oversized", name: "Oversized", zh: "宽松oversize" },
  { id: "boxy", name: "Boxy", zh: "廓形" },
  { id: "slim", name: "Slim", zh: "修身" },
  { id: "relaxed", name: "Relaxed", zh: "休闲宽松" },
  { id: "cropped", name: "Cropped", zh: "短款" },
  { id: "tapered", name: "Tapered", zh: "锥形" },
  { id: "wide-leg", name: "Wide leg", zh: "阔腿" },
];

const materials: Named[] = [
  { id: "cotton", name: "Cotton", zh: "纯棉" },
  { id: "heavyweight-cotton", name: "Heavyweight cotton", zh: "重磅纯棉" },
  { id: "wool", name: "Wool", zh: "羊毛" },
  { id: "cashmere", name: "Cashmere", zh: "羊绒" },
  { id: "linen", name: "Linen", zh: "亚麻" },
  { id: "denim", name: "Denim", zh: "牛仔" },
  { id: "nylon", name: "Nylon", zh: "尼龙" },
  { id: "gore-tex", name: "GORE-TEX", zh: "GORE-TEX防水" },
  { id: "fleece", name: "Fleece", zh: "抓绒" },
  { id: "leather", name: "Leather", zh: "真皮" },
  { id: "down", name: "Down", zh: "白鸭绒" },
  { id: "corduroy", name: "Corduroy", zh: "灯芯绒" },
];

const brands: Brand[] = [
  { id: "arcteryx", name: "Arc'teryx", zh: ["始祖鸟", "始祖鳥"], aliases: ["arcteryx", "arc teryx", "arc"], tags: ["outdoor", "techwear"], price_tier: 4, categories: ["shell-jacket", "fleece", "backpack", "cap"] },
  { id: "the-north-face", name: "The North Face", zh: ["北面"], aliases: ["tnf", "north face"], tags: ["outdoor", "streetwear"], price_tier: 3, categories: ["puffer", "shell-jacket", "backpack"] },
  { id: "salomon", name: "Salomon", zh: ["萨洛蒙"], aliases: [], tags: ["outdoor", "techwear"], price_tier: 3, categories: ["trail-shoes"] },
  { id: "patagonia", name: "Patagonia", zh: ["巴塔哥尼亚"], aliases: ["patagucci"], tags: ["outdoor"], price_tier: 3, categories: ["fleece", "shell-jacket"] },
  { id: "nike", name: "Nike", zh: ["耐克"], aliases: ["nk"], tags: ["sportswear", "streetwear"], price_tier: 2, categories: ["sneakers", "hoodie", "sweatpants"] },
  { id: "adidas", name: "Adidas", zh: ["阿迪达斯", "三叶草"], aliases: ["adi"], tags: ["sportswear", "streetwear"], price_tier: 2, categories: ["sneakers", "sweatpants"] },
  { id: "new-balance", name: "New Balance", zh: ["新百伦"], aliases: ["nb", "newbalance"], tags: ["sportswear"], price_tier: 2, categories: ["sneakers"] },
  { id: "lululemon", name: "Lululemon", zh: ["露露乐蒙"], aliases: ["lulu"], tags: ["sportswear"], price_tier: 3, categories: ["sweatpants", "hoodie"] },
  { id: "li-ning", name: "Li-Ning", zh: ["李宁", "中国李宁"], aliases: ["lining", "li ning"], tags: ["chinese", "sportswear"], price_tier: 1, categories: ["sneakers", "hoodie"] },
  { id: "anta", name: "Anta", zh: ["安踏"], aliases: [], tags: ["chinese", "sportswear"], price_tier: 1, categories: ["sneakers"] },
  { id: "stussy", name: "Stüssy", zh: ["斯图西"], aliases: ["stussy"], tags: ["streetwear", "skate"], price_tier: 2, categories: ["tee", "hoodie", "cap"] },
  { id: "supreme", name: "Supreme", zh: [], aliases: ["sup"], tags: ["streetwear", "skate"], price_tier: 3, categories: ["hoodie", "cap", "tee"] },
  { id: "fear-of-god", name: "Fear of God Essentials", zh: ["ESSENTIALS", "雾霾"], aliases: ["essentials", "fog"], tags: ["streetwear", "basics"], price_tier: 2, categories: ["hoodie", "sweatpants", "tee"] },
  { id: "carhartt", name: "Carhartt WIP", zh: ["卡哈特"], aliases: ["carhartt", "wip"], tags: ["workwear", "streetwear"], price_tier: 2, categories: ["cargo-pants", "beanie", "tee"] },
  { id: "dickies", name: "Dickies", zh: ["迪凯斯"], aliases: [], tags: ["workwear", "skate"], price_tier: 1, categories: ["trousers", "shorts"] },
  { id: "levis", name: "Levi's", zh: ["李维斯"], aliases: ["levis", "levi"], tags: ["denim", "basics"], price_tier: 2, categories: ["jeans", "denim-jacket"] },
  { id: "uniqlo", name: "Uniqlo", zh: ["优衣库"], aliases: [], tags: ["basics", "japanese"], price_tier: 1, categories: ["tee", "sweater", "trousers"] },
  { id: "muji", name: "Muji", zh: ["无印良品"], aliases: [], tags: ["basics", "japanese"], price_tier: 1, categories: ["shirt", "sweater"] },
  { id: "comme-des-garcons", name: "Comme des Garçons", zh: ["川久保玲"], aliases: ["cdg", "comme des garcons", "play"], tags: ["designer", "japanese"], price_tier: 4, categories: ["tee", "shirt"] },
  { id: "issey-miyake", name: "Issey Miyake", zh: ["三宅一生"], aliases: ["pleats please", "homme plisse"], tags: ["designer", "japanese"], price_tier: 4, categories: ["trousers", "tote"] },
  { id: "ader-error", name: "Ader Error", zh: [], aliases: ["adererror", "ader"], tags: ["korean", "streetwear"], price_tier: 3, categories: ["hoodie", "sweater"] },
  { id: "stone-island", name: "Stone Island", zh: ["石头岛"], aliases: ["stoney", "si"], tags: ["designer", "techwear"], price_tier: 4, categories: ["sweatshirt", "shell-jacket"] },
  { id: "acne-studios", name: "Acne Studios", zh: [], aliases: ["acne"], tags: ["designer"], price_tier: 4, categories: ["scarf", "jeans"] },
  { id: "moncler", name: "Moncler", zh: ["盟可睐"], aliases: [], tags: ["luxury"], price_tier: 4, categories: ["puffer"] },
];

const styles: Style[] = [
  { id: "gorpcore", name: "Gorpcore", zh: ["山系", "户外机能"], description: "Technical outdoor gear worn in the city: shells, fleece and trail shoes.", categories: ["shell-jacket", "fleece", "cargo-pants", "trail-shoes", "cap", "crossbody"], brands: ["arcteryx", "salomon", "the-north-face", "patagonia"], colors: ["olive", "black", "beige", "orange"], materials: ["gore-tex", "fleece", "nylon"], image_query: "gorpcore outfit street style shell jacket" },
  { id: "streetwear", name: "Streetwear", zh: ["街头", "潮牌"], description: "Heavyweight hoodies, graphic tees, loose pants and sneakers.", categories: ["hoodie", "tee", "cargo-pants", "sneakers", "cap"], brands: ["stussy", "supreme", "nike", "fear-of-god"], colors: ["black", "grey", "white", "red"], materials: ["heavyweight-cotton", "fleece"], image_query: "streetwear outfit oversized hoodie sneakers" },
  { id: "quiet-luxury", name: "Quiet luxury", zh: ["老钱风", "静奢风"], description: "Tailored basics in muted tones and good fabrics, no logos.", categories: ["sweater", "polo", "trousers", "loafers", "coat"], brands: ["acne-studios", "uniqlo"], colors: ["cream", "navy", "beige", "brown"], materials: ["cashmere", "wool", "linen"], image_query: "quiet luxury old money outfit men" },
  { id: "japanese-minimal", name: "Japanese minimal", zh: ["日系", "极简"], description: "Loose, quiet layers in natural colors and fabrics.", categories: ["shirt", "trousers", "sweater", "tote"], brands: ["muji", "uniqlo", "issey-miyake"], colors: ["cream", "beige", "charcoal", "olive"], materials: ["cotton", "linen"], image_query: "japanese minimal outfit linen wide pants" },
  { id: "workwear", name: "Workwear", zh: ["工装风", "美式复古"], description: "Rugged canvas, chore coats, carpenter pants and boots.", categories: ["denim-jacket", "cargo-pants", "boots", "beanie", "tee"], brands: ["carhartt", "dickies", "levis"], colors: ["brown", "olive", "navy", "cream"], materials: ["denim", "heavyweight-cotton", "corduroy"], image_query: "workwear outfit carhartt chore coat boots" },
  { id: "techwear", name: "Techwear", zh: ["机能风"], description: "Black technical layers with straps, zips and many pockets.", categories: ["shell-jacket", "cargo-pants", "sneakers", "crossbody"], brands: ["arcteryx", "stone-island", "nike"], colors: ["black", "charcoal", "olive"], materials: ["nylon", "gore-tex"], image_query: "techwear outfit black cargo shell jacket" },
  { id: "korean-casual", name: "Korean casual", zh: ["韩系", "韩系穿搭"], description: "Clean oversized fits in soft colors, layered and neat.", categories: ["sweater", "shirt", "trousers", "sneakers"], brands: ["ader-error"], colors: ["grey", "cream", "light-blue", "white"], materials: ["cotton", "wool"], image_query: "korean casual outfit men oversized" },
  { id: "athleisure", name: "Athleisure", zh: ["运动休闲"], description: "Sportswear for every day: joggers, zip tops and runners.", categories: ["sweatpants", "hoodie", "sneakers", "cap"], brands: ["lululemon", "nike", "adidas", "li-ning"], colors: ["black", "grey", "white"], materials: ["nylon", "cotton"], image_query: "athleisure outfit joggers zip hoodie" },
];

export const CATALOG: Catalog = { categories, brands, styles, colors, fits, materials };

const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
const CAT = byId(categories);
const COLOR = byId(colors);
const FIT = byId(fits);
const MATERIAL = byId(materials);
const BRAND = byId(brands);
const STYLE = byId(styles);

// ---------------------------------------------------------------------------
// Garment placeholder images

type Shape =
  | "tee"
  | "hoodie"
  | "crew"
  | "jacket"
  | "puffer"
  | "pants"
  | "shorts"
  | "skirt"
  | "sneaker"
  | "boot"
  | "backpack"
  | "tote"
  | "cap"
  | "beanie"
  | "scarf";

const SHAPE: Record<string, Shape> = {
  tee: "tee",
  shirt: "tee",
  polo: "tee",
  hoodie: "hoodie",
  sweatshirt: "crew",
  sweater: "crew",
  "shell-jacket": "jacket",
  fleece: "jacket",
  bomber: "jacket",
  "denim-jacket": "jacket",
  coat: "jacket",
  blazer: "jacket",
  puffer: "puffer",
  jeans: "pants",
  "cargo-pants": "pants",
  trousers: "pants",
  sweatpants: "pants",
  shorts: "shorts",
  skirt: "skirt",
  sneakers: "sneaker",
  "trail-shoes": "sneaker",
  loafers: "sneaker",
  boots: "boot",
  backpack: "backpack",
  tote: "tote",
  crossbody: "tote",
  cap: "cap",
  beanie: "beanie",
  scarf: "scarf",
  belt: "scarf",
};

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function garmentPaths(shape: Shape, c: string, cargo: boolean): string {
  const d = shade(c, -0.25);
  const l = shade(c, 0.18);
  const line = "rgba(0,0,0,.18)";
  switch (shape) {
    case "tee":
      return `<path d="M62 46 82 34Q100 46 118 34L138 46 170 76 150 96 140 86V170H60V86L50 96 30 76Z" fill="${c}" stroke="${line}"/><path d="M82 34Q100 52 118 34" fill="none" stroke="${d}" stroke-width="4"/>`;
    case "hoodie":
      return `<path d="M58 54 80 42H120L142 54 172 124 156 132 142 96V174H58V96L44 132 28 124Z" fill="${c}" stroke="${line}"/><path d="M80 42Q100 6 120 42Q100 62 80 42Z" fill="${d}"/><path d="M74 132H126L120 158H80Z" fill="${d}" opacity=".55"/><path d="M95 60V84M105 60V84" stroke="${l}" stroke-width="2.5" stroke-linecap="round"/><path d="M58 166H142" stroke="${d}" stroke-width="5"/>`;
    case "crew":
      return `<path d="M58 50 82 40Q100 50 118 40L142 50 170 128 154 134 142 98V172H58V98L46 134 30 128Z" fill="${c}" stroke="${line}"/><path d="M82 40Q100 56 118 40" fill="none" stroke="${d}" stroke-width="5"/><path d="M58 164H142M30 128 46 134M154 134 170 128" stroke="${d}" stroke-width="5"/>`;
    case "jacket":
      return `<path d="M56 50 80 38H120L144 50 172 130 156 136 144 100V174H56V100L44 136 28 130Z" fill="${c}" stroke="${line}"/><path d="M80 38 100 64 120 38" fill="${d}"/><path d="M100 64V174" stroke="${d}" stroke-width="3"/><path d="M68 120H90M110 120H132" stroke="${d}" stroke-width="3"/>`;
    case "puffer":
      return `<path d="M54 52 80 38H120L146 52 174 130 156 138 146 102V174H54V102L44 138 26 130Z" fill="${c}" stroke="${line}"/><path d="M58 76H142M56 100H144M56 124H144M56 148H144" stroke="${d}" stroke-width="2.5"/><path d="M80 38Q100 30 120 38V48H80Z" fill="${d}"/><path d="M100 48V174" stroke="${l}" stroke-width="2"/>`;
    case "pants":
      return `<path d="M64 28H136L148 176H112L100 76 88 176H52Z" fill="${c}" stroke="${line}"/><path d="M64 28H136V40H64Z" fill="${d}"/>${cargo ? `<rect x="56" y="104" width="22" height="26" rx="3" fill="${d}"/><rect x="122" y="104" width="22" height="26" rx="3" fill="${d}"/>` : `<path d="M74 44Q80 62 72 74M126 44Q120 62 128 74" stroke="${d}" stroke-width="2.5" fill="none"/>`}`;
    case "shorts":
      return `<path d="M60 52H140L150 140H108L100 96 92 140H50Z" fill="${c}" stroke="${line}"/><path d="M60 52H140V64H60Z" fill="${d}"/>`;
    case "skirt":
      return `<path d="M70 44H130L156 166H44Z" fill="${c}" stroke="${line}"/><path d="M70 44H130V56H70Z" fill="${d}"/><path d="M84 60 72 164M100 60V166M116 60 128 164" stroke="${d}" stroke-width="2" opacity=".6"/>`;
    case "sneaker":
      return `<path d="M22 146Q22 158 34 158H172Q184 158 184 146V138H22Z" fill="#f2f0ea" stroke="${line}"/><path d="M26 138 30 108Q42 98 62 94L92 70Q102 62 116 66L132 74Q144 82 152 98Q172 106 182 120Q186 130 184 138Z" fill="${c}" stroke="${line}"/><path d="M60 124Q112 120 160 98" stroke="${l}" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M104 78 120 74M108 86 124 82" stroke="${l}" stroke-width="3" stroke-linecap="round"/>`;
    case "boot":
      return `<path d="M50 160Q50 172 62 172H164Q176 172 176 160V152H50Z" fill="${d}"/><path d="M58 152V48H112V112Q150 116 170 134L174 152Z" fill="${c}" stroke="${line}"/><path d="M58 60H112M84 70 96 66M84 84 96 80M84 98 96 94" stroke="${d}" stroke-width="3" stroke-linecap="round"/>`;
    case "backpack":
      return `<path d="M76 46Q76 30 100 30Q124 30 124 46" fill="none" stroke="${d}" stroke-width="7"/><rect x="56" y="44" width="88" height="128" rx="22" fill="${c}" stroke="${line}"/><rect x="70" y="112" width="60" height="44" rx="8" fill="${d}"/><path d="M70 70H130" stroke="${d}" stroke-width="3"/>`;
    case "tote":
      return `<path d="M74 70Q74 34 100 34Q126 34 126 70" fill="none" stroke="${d}" stroke-width="6"/><path d="M50 70H150L160 170H40Z" fill="${c}" stroke="${line}"/>`;
    case "cap":
      return `<path d="M50 124Q50 66 104 66Q154 66 154 124Z" fill="${c}" stroke="${line}"/><path d="M40 124H176Q182 138 154 140L40 132Z" fill="${d}"/><circle cx="104" cy="68" r="5" fill="${d}"/><path d="M104 70V124" stroke="${d}" stroke-width="2" opacity=".5"/>`;
    case "beanie":
      return `<path d="M54 132Q54 56 100 56Q146 56 146 132Z" fill="${c}" stroke="${line}"/><rect x="48" y="122" width="104" height="30" rx="6" fill="${d}"/><path d="M60 128V146M72 128V146M84 128V146M96 128V146M108 128V146M120 128V146M132 128V146M144 128V146" stroke="${shade(c, -0.4)}" stroke-width="2"/>`;
    case "scarf":
      return `<path d="M40 60Q100 40 160 60L150 84Q100 66 50 84Z" fill="${c}" stroke="${line}"/><path d="M120 76 136 170H110L104 80Z" fill="${d}"/><path d="M110 170V178M118 170V178M126 170V178M134 170V178" stroke="${d}" stroke-width="2"/>`;
  }
}

export function garmentSvg(category: string, colorHex: string, bg: string, opts: { cargo?: boolean; tilt?: number } = {}): string {
  const shape = SHAPE[category] ?? "tee";
  const tilt = opts.tilt ?? 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="400" height="400"><rect width="200" height="200" fill="${bg}"/><g transform="rotate(${tilt} 100 100)">${garmentPaths(shape, colorHex, opts.cargo ?? category === "cargo-pants")}</g></svg>`;
}

export function svgUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const BGS = ["#f3f2ef", "#ffffff", "#e9e4da", "#dde3e8", "#d2c2a8", "#cfcfcb", "#2b2b2e", "#efe0dc"];

// ---------------------------------------------------------------------------
// Garment search results

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const KEYWORDS: [RegExp, string][] = [
  [/hood/i, "hoodie"],
  [/sweatshirt|crewneck/i, "sweatshirt"],
  [/sweater|knit|cardigan/i, "sweater"],
  [/t-?shirt|tee\b/i, "tee"],
  [/polo/i, "polo"],
  [/shirt/i, "shirt"],
  [/shell|rain jacket|windbreaker/i, "shell-jacket"],
  [/puffer|down jacket/i, "puffer"],
  [/fleece/i, "fleece"],
  [/bomber/i, "bomber"],
  [/denim jacket|trucker/i, "denim-jacket"],
  [/coat|overcoat|chore/i, "coat"],
  [/blazer/i, "blazer"],
  [/jeans/i, "jeans"],
  [/cargo|carpenter/i, "cargo-pants"],
  [/sweatpants|joggers/i, "sweatpants"],
  [/trousers|pants|chinos/i, "trousers"],
  [/shorts/i, "shorts"],
  [/skirt/i, "skirt"],
  [/trail|runner/i, "trail-shoes"],
  [/boot/i, "boots"],
  [/loafer/i, "loafers"],
  [/sneaker|shoe/i, "sneakers"],
  [/backpack/i, "backpack"],
  [/tote/i, "tote"],
  [/crossbody|sling/i, "crossbody"],
  [/beanie/i, "beanie"],
  [/cap\b|hat/i, "cap"],
  [/scarf/i, "scarf"],
  [/belt/i, "belt"],
];

export function inferCategory(query: string): string | null {
  for (const [re, id] of KEYWORDS) if (re.test(query)) return id;
  return null;
}

function inferColors(query: string): string[] {
  const q = query.toLowerCase();
  return colors.filter((c) => q.includes(c.name.toLowerCase())).map((c) => c.id);
}

const BASE_PRICE: Record<string, [number, number]> = {
  tops: [59, 329],
  outerwear: [189, 1299],
  bottoms: [69, 349],
  shoes: [129, 899],
  bags: [49, 459],
  accessories: [19, 159],
};

const SHOPS: Record<Source, string[]> = {
  taobao: ["潮流前线严选", "阿杰潮牌工作室", "简约衣舍", "山系户外装备店", "小林家的衣橱", "日系男装研究所", "重磅基础款店", "韩系男生穿搭"],
  "1688": ["广州白云区服装厂", "杭州四季青源头", "石狮户外服饰工厂", "东莞针织源头厂"],
  weidian: ["Kevin 潮牌代购", "老K精品", "PK God 总代", "阿龙的店"],
  yupoo: ["example-store", "sample-kicks", "demo-shop", "test-gallery"],
};

const FILLER = ["男女同款", "秋冬新款", "情侣款", "百搭", "ins风", "高级感", "潮牌", "宽松显瘦", "加厚", "春秋"];

export interface GarmentSpec {
  id: string;
  query: string;
  options: SearchOptions;
  profile: Profile | null;
}

export interface GarmentListing extends Listing {
  arrival: 1 | 2 | 3 | 4;
  colorId: string;
  productKey: string;
}

export interface GarmentPlan {
  category: Category;
  mainColors: string[];
  listings: GarmentListing[];
  queries: Queries;
  refs: { key: string; colorId: string; outlier: boolean }[];
}

export const garmentImages: Record<string, string> = {};

function img(key: string, svg: string): string {
  garmentImages[key] = svgUri(svg);
  return key;
}

const MODE_LABEL = { exact: "Exact product", similar: "Similar style", alternatives: "Cheaper alternatives" } as const;

function sizeTip(profile: Profile | null, cat: Category): string {
  if (!profile) return "";
  if ((cat.group === "tops" || cat.group === "outerwear") && profile.sizes.top) {
    return `You usually wear ${profile.sizes.top}. Chinese sizes run about one size small, so look for one size up and check the chest width (胸围).`;
  }
  if (cat.group === "bottoms" && profile.sizes.bottom) {
    return `You usually wear ${profile.sizes.bottom}. Compare the waist (腰围) in cm on the size chart.`;
  }
  if (cat.group === "shoes" && profile.sizes.shoe) {
    return `You wear ${profile.sizes.shoe}. Check the foot length (脚长) in mm before ordering.`;
  }
  return "";
}

export function planGarmentSearch(spec: GarmentSpec): GarmentPlan {
  const o = spec.options;
  const r = rng(hash(spec.id + spec.query));
  const cat = CAT.get(o.category ?? "") ?? CAT.get(inferCategory(spec.query) ?? "") ?? CAT.get("hoodie")!;
  const styleList = (o.styles ?? []).map((s) => STYLE.get(s)).filter((s): s is Style => !!s);
  let mainColors = o.colors?.length ? o.colors : inferColors(spec.query);
  if (!mainColors.length) mainColors = styleList[0]?.colors.slice(0, 1) ?? ["charcoal"];
  const brandList = (o.brands ?? []).map((b) => BRAND.get(b)).filter((b): b is Brand => !!b);
  const fit = FIT.get(o.fit ?? "");
  const material = MATERIAL.get(o.materials?.[0] ?? "");
  const mode = o.mode ?? "exact";
  const [lo, hi] = BASE_PRICE[cat.group];
  const priceScale = mode === "alternatives" ? 0.45 : brandList.length ? 1 + 0.35 * Math.max(...brandList.map((b) => b.price_tier)) : 1;

  const unselectedColors = colors.filter((c) => !mainColors.includes(c.id)).map((c) => c.id);
  const otherColors = unselectedColors.length ? unselectedColors : mainColors;
  const products = 15;
  const listings: GarmentListing[] = [];
  let n = 0;
  for (let p = 0; p < products; p++) {
    const colorId = p < 7 ? mainColors[p % mainColors.length] : otherColors[Math.floor(r() * otherColors.length)];
    const color = COLOR.get(colorId)!;
    const brand = mode !== "alternatives" && brandList.length && p < 6 ? brandList[p % brandList.length] : null;
    const bg = BGS[Math.floor(r() * BGS.length)];
    const imageKey = img(`mock/g/${spec.id}/${p}`, garmentSvg(cat.id, color.hex, bg, { tilt: Math.round((r() - 0.5) * 10) }));
    const productBase = Math.max(0.12, 0.97 - p * 0.055 - (colorId === mainColors[0] ? 0 : 0.08) + (r() - 0.5) * 0.04);
    const sellers = p < 5 ? 2 + Math.floor(r() * 3) : r() < 0.35 ? 2 : 1;
    const basePrice = Math.round((lo + r() * (hi - lo) * 0.6) * priceScale);
    const style = styleList[p % Math.max(1, styleList.length)];
    for (let k = 0; k < sellers; k++) {
      const src: Source = brand && k === 0 ? "taobao" : (["taobao", "taobao", "1688", "weidian", "yupoo"] as Source[])[Math.floor(r() * 5)];
      const official = !!brand && k === 0 && src === "taobao";
      const nativeId = String(Math.floor(r() * 9e11) + 1e11);
      const shop = official ? `${brand!.zh[0] ?? brand!.name}官方旗舰店` : SHOPS[src][Math.floor(r() * SHOPS[src].length)];
      const price = src === "yupoo" && r() < 0.4 ? null : Math.round(basePrice * (official ? 1.6 : src === "1688" ? 0.55 : 0.85 + r() * 0.3));
      const parts = [
        brand ? (brand.zh[0] ?? brand.name) : null,
        style && r() < 0.6 ? style.zh[0] : null,
        color.zh,
        fit ? fit.zh : null,
        material ? material.zh : null,
        cat.zh,
        o.gender === "women" ? "女" : o.gender === "men" ? "男" : null,
        FILLER[Math.floor(r() * FILLER.length)],
        FILLER[Math.floor(r() * FILLER.length)],
      ].filter(Boolean);
      if (mode === "alternatives" && brandList.length && p % 4 === 1 && k === 0) parts.unshift(`${brandList[0].zh[0] ?? brandList[0].name}同款`);
      const title = src === "yupoo" ? `${brand ? brand.name : "Premium"} ${color.name} ${cat.name} ${price ? `【${price}Y】` : ""}`.trim() : parts.join(" ");
      const score = Math.max(0.05, Math.min(0.99, productBase - k * 0.012 + (r() - 0.5) * 0.02));
      const found: Method[] = src === "yupoo" ? ["store"] : r() < 0.25 ? ["text", "image"] : ["text"];
      listings.push({
        id: `${src}:${nativeId}`,
        source: src,
        native_id: nativeId,
        url:
          src === "taobao"
            ? official
              ? `https://detail.tmall.com/item.htm?id=${nativeId}`
              : `https://item.taobao.com/item.htm?id=${nativeId}`
            : src === "1688"
              ? `https://detail.1688.com/offer/${nativeId}.html`
              : src === "weidian"
                ? `https://weidian.com/item.html?itemID=${nativeId}`
                : `https://${shop}.x.yupoo.com/albums/${nativeId}?uid=1`,
        title,
        image_url: `https://img.example.invalid/${nativeId}.jpg`,
        image_key: imageKey,
        price_cny: price,
        shop,
        sales: src === "yupoo" ? null : src === "1688" ? `已售 ${Math.floor(r() * 9000) + 100}件` : `${Math.floor(r() * 30) * 100 + 50}+人付款`,
        found_by: found,
        via: src === "yupoo" ? ["store-index"] : ["browser"],
        image_score: Math.round((0.35 + score * 0.6) * 1000) / 1000,
        text_score: Math.round((0.4 + r() * 0.6) * 100) / 100,
        score: Math.round(score * 1000) / 1000,
        tier: "weak",
        verdict: null,
        verdict_note: "",
        group: -1,
        extra_keys: [],
        match_key: imageKey,
        albums: [],
        official,
        // In alternatives mode a few listings still carry the brand's name: copies.
        branded: mode === "alternatives" && brandList.length > 0 && p % 4 === 1 && k === 0,
        avoid_hit: (src === "taobao" || src === "1688") && r() < 0.08,
        arrival: (src === "taobao" ? 1 : src === "1688" || src === "weidian" ? 2 : src === "yupoo" ? 4 : 3) as 1 | 2 | 3 | 4,
        colorId,
        productKey: `p${p}`,
      });
      n++;
    }
  }

  const refs = [
    ...[0, 1, 2, 3, 4].map((i) => ({
      key: img(`mock/g/${spec.id}/ref${i}`, garmentSvg(cat.id, COLOR.get(mainColors[i % mainColors.length])!.hex, BGS[(i + 1) % BGS.length], { tilt: i * 3 - 6 })),
      colorId: mainColors[i % mainColors.length],
      outlier: false,
    })),
    {
      key: img(`mock/g/${spec.id}/ref5`, garmentSvg(cat.id, COLOR.get(otherColors[0])!.hex, BGS[0])),
      colorId: otherColors[0],
      outlier: true,
    },
  ];

  const colorNames = mainColors.map((c) => COLOR.get(c)?.name.toLowerCase()).filter(Boolean).join(" or ");
  const summaryParts = [
    `${MODE_LABEL[mode]}:`,
    [colorNames, fit?.name.toLowerCase(), material?.name.toLowerCase(), cat.name.toLowerCase()].filter(Boolean).join(" "),
    brandList.length && mode !== "alternatives" ? `from ${brandList.map((b) => b.name).join(" or ")}` : null,
    brandList.length && mode === "alternatives" ? `that looks like ${brandList.map((b) => b.name).join(" or ")}, unbranded` : null,
    styleList.length ? `in a ${styleList.map((s) => s.name.toLowerCase()).join(" / ")} style` : null,
    o.price_max ? `under ¥${o.price_max}` : null,
    o.notes ? `(${o.notes})` : null,
  ].filter(Boolean);
  const queries: Queries = {
    zh: [
      `${COLOR.get(mainColors[0])!.zh}${fit ? fit.zh : ""}${cat.zh}`,
      ...(brandList.length && mode !== "alternatives" ? [`${brandList[0].zh[0] ?? brandList[0].name} ${cat.zh}`] : []),
      ...(styleList.length ? [`${styleList[0].zh[0]} ${cat.zh}`] : []),
      ...(material ? [`${material.zh}${cat.zh}`] : []),
    ],
    en: [spec.query || `${colorNames} ${cat.name.toLowerCase()}`],
    codes: [],
    category: cat.id,
    summary: summaryParts.join(" "),
    avoid: [
      "童装",
      "kids",
      ...(o.gender === "men" ? ["女款"] : o.gender === "women" ? ["男款"] : []),
      ...(o.notes && /logo/i.test(o.notes) ? ["大logo"] : []),
      // Alternatives: the brand's seller names and copy markers mark a copy, not an alternative.
      ...(mode === "alternatives" ? [...brandList.flatMap((b) => [b.name, ...b.zh, ...b.aliases]), "原单", "复刻", "1:1", "高仿", "同款logo", "代购级", "顶级版本", "专柜"] : []),
    ],
    size_tip: sizeTip(spec.profile, cat),
  };
  return { category: cat, mainColors, listings, queries, refs };
}

function tierFor(score: number): Tier {
  if (score >= 0.85) return "exact";
  if (score >= 0.7) return "close";
  if (score >= 0.5) return "similar";
  return "weak";
}

/** Listings and groups for the batches that have arrived so far. */
export function garmentResults(
  plan: GarmentPlan,
  arrived: number,
  verified: boolean,
  selectedOutliers: string[],
  mode: SearchOptions["mode"],
): { listings: Listing[]; groups: Group[] } {
  const boost = new Set(selectedOutliers);
  const listings: Listing[] = plan.listings
    .filter((l) => l.arrival <= arrived)
    .map(({ arrival: _a, colorId, productKey: _p, ...l }) => {
      const score = Math.min(0.99, l.score + (boost.has(colorId) ? 0.12 : 0));
      return { ...l, score, tier: tierFor(score) };
    })
    .sort((a, b) => b.score - a.score);
  if (verified) {
    const look = mode === "similar" || mode === "alternatives";
    for (const l of listings.slice(0, 16)) {
      const g = plan.listings.find((x) => x.id === l.id)!;
      if (plan.mainColors.includes(g.colorId) && l.score > 0.6) {
        l.verdict = "same";
        l.verdict_note = look ? "Matches the look: same cut and color." : "Same item: cut, color and details match.";
      } else if (l.score > 0.45) {
        l.verdict = "variant";
        l.verdict_note = `Same kind of item in ${COLOR.get(g.colorId)?.name.toLowerCase() ?? "another color"}.`;
        if (l.tier === "exact" || l.tier === "close") l.tier = "similar";
      } else {
        l.verdict = "different";
        l.verdict_note = "Different cut or item type.";
      }
    }
  }
  const byProduct = new Map<string, Listing[]>();
  for (const l of listings) {
    const key = plan.listings.find((x) => x.id === l.id)!.productKey;
    byProduct.set(key, [...(byProduct.get(key) ?? []), l]);
  }
  const groups: Group[] = [];
  let id = 0;
  for (const ls of byProduct.values()) {
    const gid = id++;
    for (const l of ls) l.group = gid;
    const prices = ls.map((l) => l.price_cny).filter((p): p is number => p != null);
    groups.push({
      id: gid,
      listing_ids: ls.map((l) => l.id),
      best_id: ls[0].id,
      size: ls.length,
      min_price: prices.length ? Math.min(...prices) : null,
      max_price: prices.length ? Math.max(...prices) : null,
      sources: [...new Set(ls.map((l) => l.source))],
      score: ls[0].score,
    });
  }
  groups.sort((a, b) => b.score - a.score);
  return { listings, groups };
}

// ---------------------------------------------------------------------------
// AI stylist

function item(label: string, why: string, category: string, colorIds: string[], extra: SearchOptions = {}): SuggestItem {
  const color = colorIds.map((c) => COLOR.get(c)?.name.toLowerCase()).join(" ");
  const cat = CAT.get(category)!;
  return {
    label,
    why,
    query: `${color} ${cat.name.toLowerCase()}`.trim(),
    options: { mode: "similar", category, colors: colorIds, ...extra },
  };
}

const STARTER: Record<string, SuggestItem[]> = {
  gorpcore: [
    item("Shell jacket in olive", "The key piece: a waterproof hardshell you wear every day.", "shell-jacket", ["olive"], { materials: ["gore-tex"], styles: ["gorpcore"] }),
    item("Cream fleece half-zip", "Soft mid layer that reads outdoorsy without a logo.", "fleece", ["cream"], { materials: ["fleece"], styles: ["gorpcore"] }),
    item("Black cargo trail pants", "Tapered nylon pants with pockets; tidy enough for the city.", "cargo-pants", ["black"], { fit: "tapered", materials: ["nylon"] }),
    item("Grey trail running shoes", "Salomon-style runners finish the look.", "trail-shoes", ["grey"]),
    item("Technical cap in beige", "A light nylon cap keeps the rain off.", "cap", ["beige"]),
    item("Small crossbody sling", "Holds phone and keys; worn across the chest.", "crossbody", ["black"]),
  ],
  streetwear: [
    item("Heavyweight grey hoodie", "Boxy and thick; the base of most streetwear outfits.", "hoodie", ["grey"], { fit: "boxy", materials: ["heavyweight-cotton"] }),
    item("Black graphic tee", "Oversized with a small back print.", "tee", ["black"], { fit: "oversized" }),
    item("Wide cargo pants in olive", "Loose, stacked over sneakers.", "cargo-pants", ["olive"], { fit: "wide-leg" }),
    item("White leather sneakers", "Clean low-tops that go with everything.", "sneakers", ["white"]),
    item("Washed black cap", "A faded cap softens the look.", "cap", ["black"]),
  ],
};

function starterFor(styleId: string): SuggestItem[] {
  if (STARTER[styleId]) return STARTER[styleId];
  const style = STYLE.get(styleId);
  if (!style) return [];
  return style.categories.slice(0, 6).map((c, i) => {
    const color = style.colors[i % style.colors.length];
    const cat = CAT.get(c)!;
    return item(`${COLOR.get(color)!.name} ${cat.name.toLowerCase()}`, `A typical ${style.name.toLowerCase()} piece.`, c, [color], { styles: [styleId] });
  });
}

export class MockError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function mockSuggest(req: { anchor?: { search_id?: string; query?: string }; styles?: string[]; notes?: string; count?: number }, anchorQuery: string | null): Suggestions {
  const count = Math.min(10, Math.max(1, req.count ?? 6));
  const notes = req.notes?.trim() ?? "";
  if (/^fail\b/i.test(notes)) throw new MockError("The AI stylist is not available right now. Try again in a minute.", 502);
  if (/^nothing\b/i.test(notes)) return { title: "No ideas for that", items: [] };
  if (req.styles?.length) {
    const style = STYLE.get(req.styles[0]);
    return { title: `${style?.name ?? "Style"} starter kit`, items: starterFor(req.styles[0]).slice(0, count) };
  }
  if (req.anchor) {
    const what = anchorQuery || req.anchor.query || "this item";
    return {
      title: `Complete the look: ${what}`,
      items: [
        item("Wide grey sweatpants", "Soft grey keeps the focus on the shoes.", "sweatpants", ["grey"], { fit: "wide-leg" }),
        item("Boxy white tee", "Clean base layer that matches black and white.", "tee", ["white"], { fit: "boxy", materials: ["heavyweight-cotton"] }),
        item("Black crewneck sweatshirt", "Repeats the black of the shoes up top.", "sweatshirt", ["black"]),
        item("Navy corduroy cap", "Adds texture without competing.", "cap", ["navy"], { materials: ["corduroy"] }),
        item("Cream canvas tote", "A light carry-all for daily use.", "tote", ["cream"]),
      ].slice(0, count),
    };
  }
  const rain = /rain|wet|london/i.test(notes);
  return {
    title: notes ? `Ideas: ${notes.length > 48 ? `${notes.slice(0, 48)}…` : notes}` : "Ideas",
    items: (rain
      ? [
          item("Waterproof shell jacket", "Keeps you dry; layer over a sweater when it is cold.", "shell-jacket", ["black"], { materials: ["gore-tex"] }),
          item("Merino crew sweater in charcoal", "Warm, breathable, does not smell after a long day.", "sweater", ["charcoal"], { materials: ["wool"] }),
          item("Tapered tech pants", "Quick-dry nylon that still looks smart.", "trousers", ["black"], { fit: "tapered", materials: ["nylon"] }),
          item("Waterproof trail shoes", "Grippy soles for wet streets.", "trail-shoes", ["grey"]),
          item("Wool beanie", "Small, warm and packable.", "beanie", ["olive"], { materials: ["wool"] }),
          item("Roll-top backpack", "Waterproof bag for a laptop.", "backpack", ["black"]),
        ]
      : [
          item("Oversized oxford shirt", "Easy layer over a tee.", "shirt", ["light-blue"], { fit: "oversized" }),
          item("Relaxed beige chinos", "A calm base color that goes with most tops.", "trousers", ["beige"], { fit: "relaxed" }),
          item("Navy knit sweater", "Smart enough for dinner.", "sweater", ["navy"], { materials: ["wool"] }),
          item("White sneakers", "Everyday shoes that go with everything.", "sneakers", ["white"]),
          item("Canvas tote", "For laptop and groceries.", "tote", ["cream"]),
          item("Brown leather belt", "Small detail that finishes the outfit.", "belt", ["brown"], { materials: ["leather"] }),
        ]
    ).slice(0, count),
  };
}

// ---------------------------------------------------------------------------
// Shop the look

const LOOK_ITEMS: { label: string; category: string; colors: string[]; box: Box }[] = [
  { label: "Navy baseball cap", category: "cap", colors: ["navy"], box: [0.36, 0.03, 0.64, 0.15] },
  { label: "Charcoal oversized hoodie", category: "hoodie", colors: ["charcoal"], box: [0.2, 0.15, 0.8, 0.5] },
  { label: "Olive cargo pants", category: "cargo-pants", colors: ["olive"], box: [0.28, 0.48, 0.72, 0.86] },
  { label: "White low-top sneakers", category: "sneakers", colors: ["white"], box: [0.26, 0.85, 0.74, 0.98] },
];

/** Crops each box out of the uploaded photo with a canvas, like the backend would. */
async function cropAll(src: string, boxes: Box[]): Promise<(string | null)[]> {
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
  } catch {
    return boxes.map(() => null);
  }
  return boxes.map(([x0, y0, x1, y1]) => {
    const w = Math.max(1, Math.round((x1 - x0) * image.naturalWidth));
    const h = Math.max(1, Math.round((y1 - y0) * image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, x0 * image.naturalWidth, y0 * image.naturalHeight, w, h, 0, 0, w, h);
    try {
      return canvas.toDataURL("image/jpeg", 0.85);
    } catch {
      return null;
    }
  });
}

export async function mockLook(uploadKey: string, fileName: string, imageSrc: string | undefined, register: (key: string, uri: string) => void): Promise<LookItem[]> {
  if (/fail/i.test(fileName)) throw new MockError("Couldn't analyze this photo: the AI returned no answer.", 502);
  if (/empty|blank/i.test(fileName)) return [];
  const crops = imageSrc ? await cropAll(imageSrc, LOOK_ITEMS.map((i) => i.box)) : LOOK_ITEMS.map(() => null);
  return LOOK_ITEMS.map((it, i) => {
    // Leave the last crop empty so the UI's fallback (cropping the photo with CSS) is exercised.
    let cropKey: string | null = null;
    if (crops[i] && i < LOOK_ITEMS.length - 1) {
      cropKey = `${uploadKey}/crop${i}`;
      register(cropKey, crops[i]!);
    }
    const cat = CAT.get(it.category)!;
    return {
      label: it.label,
      category: it.category,
      query: `${it.colors.map((c) => COLOR.get(c)!.name.toLowerCase()).join(" ")} ${cat.name.toLowerCase()}`,
      colors: it.colors,
      crop_key: cropKey,
      box: it.box,
    };
  });
}
