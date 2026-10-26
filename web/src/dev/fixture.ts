/**
 * Mock fixture for `?mock=1`. A realistic "Nike Dunk Low Panda" search with listings from
 * every source, multi-seller groups, outlier reference photos and sources that need a
 * login, need a key, or fail. Images are inline SVG data URIs, so no backend is needed.
 *
 * Special queries in mock mode:
 *   anything            full search (about 6 s)
 *   "nothing" / "empty" zero results: every source needs a login or key
 *   "fail" / "error"    the search fails at the reference photo step
 */
import type {
  Group,
  Listing,
  Method,
  Queries,
  RefImage,
  Source,
  SourceStatus,
  Tier,
  Verdict,
} from "../api/types";

// ---------------------------------------------------------------------------
// Placeholder images

interface Look {
  bg: string;
  base?: string;
  overlay: string;
  swoosh?: string;
  sole?: string;
  tilt?: number;
  flip?: boolean;
  scale?: number;
  pair?: boolean;
  box?: boolean;
  jordan?: boolean;
  logoOnly?: boolean;
  kind?: "shoe" | "canvas" | "chunky" | "slipper" | "laces";
}

function shoePaths(l: Look): string {
  const base = l.base ?? "#fbfbfa";
  const swoosh = l.swoosh ?? l.overlay;
  const sole = l.sole ?? "#f3f1ec";
  const line = "rgba(0,0,0,.16)";
  if (l.kind === "canvas") {
    return `<path d="M20 146Q20 158 32 158L176 158Q188 158 188 146L188 138L20 138Z" fill="#f6f6f4" stroke="${line}"/>
      <path d="M24 138L30 108Q60 92 104 86Q150 84 178 112Q190 124 188 138Z" fill="${l.overlay}" stroke="${line}"/>
      <path d="M150 96Q176 104 186 124L188 138L156 138Q150 116 150 96Z" fill="#f6f6f4"/>
      <path d="M92 92L130 88M96 100L134 96M100 108L138 104" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`;
  }
  if (l.kind === "chunky") {
    return `<path d="M14 140Q14 166 40 166L172 166Q192 166 192 142L192 128L14 128Z" fill="#efefed" stroke="${line}"/>
      <path d="M20 128L26 92Q50 74 92 70L124 62Q160 70 186 112L190 128Z" fill="${base}" stroke="${line}"/>
      <path d="M30 128L34 100Q60 90 80 104L96 128Z" fill="${l.overlay}"/>
      <path d="M120 70Q150 78 170 104L140 112Q128 94 120 70Z" fill="${l.overlay}"/>`;
  }
  if (l.kind === "slipper") {
    return `<ellipse cx="104" cy="140" rx="82" ry="22" fill="#f2f2f0" stroke="${line}"/>
      <path d="M60 136Q70 92 120 90Q160 92 170 132Z" fill="#fff" stroke="${line}"/>
      <circle cx="104" cy="112" r="14" fill="#fff" stroke="#222" stroke-width="3"/>
      <circle cx="98" cy="110" r="4" fill="#222"/><circle cx="111" cy="110" r="4" fill="#222"/>
      <circle cx="92" cy="100" r="6" fill="#222"/><circle cx="116" cy="100" r="6" fill="#222"/>`;
  }
  if (l.kind === "laces") {
    return `<path d="M30 70Q80 40 110 90T180 120" fill="none" stroke="#1d1d1f" stroke-width="7" stroke-linecap="round"/>
      <path d="M30 100Q80 70 110 120T180 150" fill="none" stroke="#f5f5f5" stroke-width="7" stroke-linecap="round"/>
      <path d="M30 100Q80 70 110 120T180 150" fill="none" stroke="rgba(0,0,0,.15)" stroke-width="1"/>`;
  }
  const heel = l.jordan
    ? `<path d="M22 138L24 96Q34 84 52 82L60 138Z" fill="${l.overlay}"/><circle cx="40" cy="104" r="6" fill="${base}"/>`
    : `<path d="M22 138L26 104Q36 96 50 93L58 138Z" fill="${l.overlay}"/>`;
  return `<path d="M18 146Q18 158 30 158L176 158Q188 158 188 146L188 138L18 138Z" fill="${sole}" stroke="${line}"/>
    <path d="M18 147L188 147" stroke="rgba(0,0,0,.08)"/>
    <path d="M22 138L26 104Q38 94 60 90L90 66Q100 58 114 62L130 70Q142 78 150 94Q172 102 184 116Q190 126 188 138Z" fill="${base}" stroke="${line}"/>
    <path d="M150 94Q172 102 184 116Q190 126 188 138L152 138Q144 116 150 94Z" fill="${l.overlay}"/>
    ${heel}
    <path d="M90 66Q100 58 114 62L130 70Q124 86 110 96L96 88Z" fill="${l.overlay}"/>
    <path d="M58 124Q112 121 162 96Q126 122 74 134Q55 137 58 124Z" fill="${swoosh}" stroke="${swoosh === base ? line : "none"}"/>
    <path d="M102 76L118 71M106 82L122 77M110 88L126 83" stroke="${base === "#fbfbfa" ? "#fff" : base}" stroke-width="3" stroke-linecap="round" opacity=".9"/>`;
}

function svg(l: Look): string {
  const tilt = l.tilt ?? 0;
  const scale = l.scale ?? 1;
  const flip = l.flip ? "translate(200 0) scale(-1 1)" : "";
  let body: string;
  if (l.logoOnly) {
    body = `<path d="M30 128Q96 124 176 70Q120 120 60 146Q22 158 30 128Z" fill="${l.overlay}"/>`;
  } else {
    const shoe = shoePaths(l);
    const pair = l.pair
      ? `<g transform="translate(-14 -30) scale(.92)" opacity=".96">${shoe}</g>`
      : "";
    const box = l.box
      ? `<rect x="26" y="40" width="150" height="60" rx="3" fill="#e46a2e"/><rect x="26" y="40" width="150" height="14" fill="#cf5a22"/>`
      : "";
    body = `${box}<g transform="translate(100 112) rotate(${tilt}) scale(${scale}) translate(-100 -112)">${pair}${shoe}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="400" height="400"><rect width="200" height="200" fill="${l.bg}"/><g transform="${flip}">${body}</g></svg>`;
}

function uri(markup: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

const BG = {
  white: "#f4f4f2",
  studio: "#ffffff",
  warm: "#ece6dc",
  wood: "#cdb08b",
  cool: "#dde3e8",
  dark: "#2a2a2d",
  concrete: "#c7c7c3",
  pink: "#f0dcdc",
  sand: "#e8dcc6",
};
const BLACK = "#1d1d1f";

/** key -> data URI. The mock API serves /api/img/{key} from here. */
export const mockImages: Record<string, string> = {};

function image(key: string, look: Look): string {
  mockImages[key] = uri(svg(look));
  return key;
}

// ---------------------------------------------------------------------------
// Reference photos

type RefKind = "panda" | "greyfog" | "logo" | "upload";

interface RefSeed extends RefImage {
  kind: RefKind;
}

export const REF_PROVIDER = "bing";

export const REFERENCES: RefSeed[] = [
  {
    key: image("mock/ref-1", { bg: BG.studio, overlay: BLACK }),
    url: "https://static.nike.com/a/images/dunk-low-retro-white-black.png",
    title: "Nike Dunk Low Retro White Black DD1391-100",
    page: "https://www.nike.com/t/dunk-low-retro-mens-shoes-76KnBL/DD1391-100",
    selected: true,
    consensus: 0.91,
    kind: "panda",
  },
  {
    key: image("mock/ref-2", { bg: BG.cool, overlay: BLACK, tilt: -6 }),
    url: "https://images.stockx.com/images/Nike-Dunk-Low-Retro-White-Black-2021.jpg",
    title: "Nike Dunk Low Retro White Black (2021)",
    page: "https://stockx.com/nike-dunk-low-retro-white-black-2021",
    selected: true,
    consensus: 0.88,
    kind: "panda",
  },
  {
    key: image("mock/ref-3", { bg: BG.white, overlay: BLACK, pair: true, scale: 0.86 }),
    url: "https://image.goat.com/dunk-low-black-white-dd1391-100.jpg",
    title: "Dunk Low 'Black White' DD1391-100",
    page: "https://www.goat.com/sneakers/dunk-low-black-white-dd1391-100",
    selected: true,
    consensus: 0.86,
    kind: "panda",
  },
  {
    key: image("mock/ref-4", { bg: BG.warm, overlay: BLACK, tilt: 8, scale: 0.94 }),
    url: "https://i.redd.it/panda-dunk-review.jpg",
    title: "Panda Dunks after 6 months",
    page: "https://www.reddit.com/r/Sneakers/comments/panda_dunks",
    selected: true,
    consensus: 0.84,
    kind: "panda",
  },
  {
    key: image("mock/ref-5", { bg: BG.white, overlay: BLACK, box: true, scale: 0.9 }),
    url: "https://www.footlocker.ca/product/dunk-low-panda.jpg",
    title: "Nike Dunk Low - Men's - White / Black",
    page: "https://www.footlocker.ca/en/product/nike-dunk-low-mens/DD1391100.html",
    selected: true,
    consensus: 0.8,
    kind: "panda",
  },
  {
    key: image("mock/ref-6", { bg: BG.sand, overlay: BLACK, flip: true }),
    url: "https://cdn.shopify.com/s/files/dunk-panda-side.jpg",
    title: "Dunk Low Panda side view",
    page: "https://www.sneakerstudio.com/dunk-low-panda",
    selected: true,
    consensus: 0.83,
    kind: "panda",
  },
  {
    key: image("mock/ref-7", { bg: BG.white, overlay: "#b9bcc1" }),
    url: "https://images.stockx.com/images/Nike-Dunk-Low-Grey-Fog.jpg",
    title: "Nike Dunk Low Grey Fog DD1391-103",
    page: "https://stockx.com/nike-dunk-low-grey-fog",
    selected: false,
    consensus: 0.41,
    kind: "greyfog",
  },
  {
    key: image("mock/ref-8", { bg: BG.dark, overlay: "#f2f2f2", logoOnly: true }),
    url: "https://wallpapercave.com/nike-logo-black.jpg",
    title: "Nike logo wallpaper",
    page: "https://wallpapercave.com/nike-logo-wallpapers",
    selected: false,
    consensus: 0.12,
    kind: "logo",
  },
];

export function uploadReference(key: string): RefSeed {
  return { key, url: "upload", title: "Your photo", page: "", selected: true, consensus: 0.9, kind: "upload" };
}

export const QUERIES: Queries = {
  zh: ["耐克 Dunk Low 熊猫", "Dunk 黑白 低帮板鞋", "DD1391-100 正品"],
  en: ["nike dunk low panda", "dunk low retro white black"],
  codes: ["DD1391-100"],
  category: "sneakers",
};

// ---------------------------------------------------------------------------
// Listings

type Product =
  | "panda"
  | "kids"
  | "greyfog"
  | "jordan"
  | "navy"
  | "green"
  | "generic"
  | "af1"
  | "canvas"
  | "chunky"
  | "slipper"
  | "laces";

const SIM: Record<Product, Record<RefKind, number>> = {
  panda: { panda: 0.9, greyfog: 0.74, logo: 0.3, upload: 0.88 },
  kids: { panda: 0.85, greyfog: 0.7, logo: 0.3, upload: 0.83 },
  greyfog: { panda: 0.72, greyfog: 0.93, logo: 0.3, upload: 0.7 },
  jordan: { panda: 0.68, greyfog: 0.6, logo: 0.32, upload: 0.66 },
  navy: { panda: 0.74, greyfog: 0.7, logo: 0.3, upload: 0.72 },
  green: { panda: 0.66, greyfog: 0.64, logo: 0.3, upload: 0.64 },
  generic: { panda: 0.7, greyfog: 0.64, logo: 0.28, upload: 0.68 },
  af1: { panda: 0.52, greyfog: 0.56, logo: 0.26, upload: 0.5 },
  canvas: { panda: 0.45, greyfog: 0.42, logo: 0.25, upload: 0.44 },
  chunky: { panda: 0.42, greyfog: 0.4, logo: 0.25, upload: 0.41 },
  slipper: { panda: 0.3, greyfog: 0.28, logo: 0.22, upload: 0.3 },
  laces: { panda: 0.36, greyfog: 0.34, logo: 0.24, upload: 0.35 },
};

const VERDICT: Record<Product, [Verdict, string]> = {
  panda: ["same", "Same model and colorway (White/Black, DD1391-100)."],
  kids: ["variant", "Same colorway in kids sizes (GS, CW1590-100)."],
  greyfog: ["variant", "Grey Fog colorway (DD1391-103), not Panda."],
  jordan: ["different", "Air Jordan 1 Low, not a Dunk."],
  navy: ["variant", "Same model, navy colorway."],
  green: ["variant", "Same model, green colorway."],
  generic: ["different", "Unbranded lookalike, no Nike details."],
  af1: ["different", "Air Force 1, a different model."],
  canvas: ["different", "Canvas shoe, not a Dunk."],
  chunky: ["different", "Chunky sneaker, different model."],
  slipper: ["different", "Slipper with a panda print."],
  laces: ["different", "Replacement laces only."],
};

const PHOTO_LOOK: Record<string, Look> = {
  pA: { bg: BG.white, overlay: BLACK },
  pB: { bg: BG.wood, overlay: BLACK, tilt: -10, scale: 0.92 },
  pC: { bg: BG.concrete, overlay: BLACK, flip: true },
  pD: { bg: BG.studio, overlay: BLACK, scale: 0.96 },
  pE: { bg: BG.pink, overlay: BLACK, scale: 0.78 },
  pF: { bg: BG.warm, overlay: "#b9bcc1" },
  pG: { bg: BG.white, overlay: BLACK, jordan: true },
  s1: { bg: BG.dark, overlay: BLACK, base: "#f2f2f0" },
  s3: { bg: BG.white, overlay: BLACK, box: true, scale: 0.9 },
  s4: { bg: BG.cool, overlay: BLACK, pair: true, scale: 0.86 },
  s5: { bg: BG.sand, overlay: BLACK, tilt: 12, scale: 0.9 },
  s6: { bg: BG.studio, overlay: "#3a3a3c", swoosh: BLACK, flip: true, scale: 0.9 },
  s7: { bg: BG.white, overlay: "#1f2a44" },
  s8: { bg: BG.cool, overlay: "#2f6b3a" },
  s9: { bg: BG.white, overlay: "#2f6b3a", flip: true },
  s10: { bg: BG.cool, overlay: "#fbfbfa", swoosh: "#fbfbfa" },
  s11: { bg: BG.wood, overlay: "#fbfbfa", swoosh: "#fbfbfa", tilt: -6 },
  s12: { bg: BG.white, overlay: BLACK, kind: "canvas" },
  s13: { bg: BG.warm, overlay: BLACK, kind: "chunky" },
  s14: { bg: BG.cool, overlay: BLACK, kind: "slipper" },
  s15: { bg: BG.white, overlay: BLACK, kind: "laces" },
  s16: { bg: BG.concrete, overlay: "#b9bcc1", tilt: 6 },
  s17: { bg: BG.white, overlay: BLACK, scale: 0.9, tilt: -4 },
  s18: { bg: BG.studio, overlay: BLACK, tilt: 4 },
  s19: { bg: BG.sand, overlay: BLACK, pair: true, scale: 0.84, flip: true },
  s20: { bg: BG.white, overlay: "#3a3a3c", tilt: 3 },
  s21: { bg: BG.cool, overlay: BLACK, tilt: -8, scale: 0.9 },
};
for (const [name, look] of Object.entries(PHOTO_LOOK)) image(`mock/${name}`, look);

interface Seed {
  source: Source;
  title: string;
  price: number | null;
  shop: string | null;
  sales: string | null;
  product: Product;
  photo: string | null; // PHOTO_LOOK name, "broken" for a failing image, null for none
  found: Method[];
  via: string[];
  arrival: 1 | 2 | 3 | 4; // results batch the listing first appears in
  group?: number;
  tmall?: boolean;
  extra?: number;
  /** Only found by Taobao photo search, which needs a Taobao login. */
  taobaoImage?: boolean;
  /** Yupoo album tag, referenced by buy links via albumOf. */
  album?: string;
  /** This listing is the buy link found inside the Yupoo album with this tag. */
  albumOf?: string;
}

const T: Method[] = ["text"];
const B = ["browser"];

const SEEDS: Seed[] = [
  // Group 0: one factory batch sold by six sellers
  { source: "taobao", title: "【精选】Nike Dunk Low 黑白熊猫 DD1391-100 低帮复古板鞋 男女同款", price: 289, shop: "潮流鞋铺", sales: "1000+人付款", product: "panda", photo: "pA", found: T, via: B, arrival: 1, group: 0 },
  { source: "taobao", title: "Dunk Low Retro 熊猫 黑白 DD1391-100 新款 支持验货 得物在线", price: 299, shop: "阿杰潮鞋工作室", sales: "500+人付款", product: "panda", photo: "pA", found: ["text", "lens"], via: ["browser", "serpapi"], arrival: 1, group: 0 },
  { source: "taobao", title: "耐克熊猫板鞋 Dunk Low 黑白配色 情侣款 DD1391-100", price: 268, shop: "潮流前线Sneaker", sales: "200+人付款", product: "panda", photo: "pA", found: T, via: B, arrival: 1, group: 0 },
  { source: "weidian", title: "精选 Dunk Low 熊猫 DD1391-100 品质款 原盒原标 细节全对", price: 275, shop: "鞋履总代", sales: "已售 3256", product: "panda", photo: "pA", found: T, via: B, arrival: 2, group: 0 },
  { source: "weidian", title: "【现货】熊猫Dunk 现货 DD1391-100 36-47.5 全码", price: 265, shop: "老K鞋馆", sales: "已售 812", product: "panda", photo: "pA", found: T, via: B, arrival: 2, group: 0 },
  { source: "yupoo", title: "Nike Dunk Low Retro White Black Panda DD1391-100 Size 36-47.5 ￥258", price: 258, shop: "example-store", sales: null, product: "panda", photo: "pA", found: ["store"], via: ["store-index"], arrival: 4, group: 0, extra: 5, album: "pk" },

  // Group 1: 1688 factory and Taobao resellers using its photo
  { source: "1688", title: "跨境货源 Dunk低帮板鞋 黑白熊猫配色 工厂直销 一件代发", price: 78, shop: "晋江市鸿运鞋业", sales: "已售 1.2万件", product: "panda", photo: "pB", found: T, via: B, arrival: 2, group: 1 },
  { source: "1688", title: "熊猫配色低帮滑板鞋 男女休闲运动鞋 源头厂家 支持混批", price: 72, shop: "晋江鞋都源头工厂", sales: "已售 8600件", product: "panda", photo: "pB", found: T, via: B, arrival: 2, group: 1 },
  { source: "taobao", title: "熊猫dunk低帮板鞋男女学生百搭休闲鞋 黑白配色 春季新款", price: 119, shop: "小林家的鞋", sales: "2000+人付款", product: "panda", photo: "pB", found: T, via: B, arrival: 1, group: 1 },
  { source: "taobao", title: "dunk熊猫鞋 黑白低帮 学生 男女款 平价 顺丰包邮", price: 99, shop: "优选鞋城", sales: "800+人付款", product: "panda", photo: "pB", found: T, via: B, arrival: 1, group: 1 },
  { source: "taobao", title: "黑白熊猫板鞋2024新款 低帮百搭 情侣鞋", price: 109, shop: "简约鞋舍", sales: "300+人付款", product: "panda", photo: "pB", found: ["lens"], via: ["serpapi"], arrival: 3, group: 1 },

  // Group 2: second seller group
  { source: "weidian", title: "LJ Dunk Low 熊猫 DD1391-100 正确鞋型 原厂皮料", price: 320, shop: "LJ 鞋店", sales: "已售 1520", product: "panda", photo: "pC", found: ["text", "store"], via: ["browser", "store-index"], arrival: 2, group: 2, albumOf: "ljr" },
  { source: "taobao", title: "LJ Dunk Low 黑白 熊猫 DD1391-100 支持对比", price: 335, shop: "鞋匠阿明", sales: "100+人付款", product: "panda", photo: "pC", found: T, via: B, arrival: 1, group: 2 },
  { source: "yupoo", title: "LJ Dunk Low Panda DD1391-100 ￥310", price: 310, shop: "sample-kicks", sales: null, product: "panda", photo: "pC", found: ["store"], via: ["store-index"], arrival: 4, group: 2, extra: 6, album: "ljr" },
  { source: "weidian", title: "LJ 熊猫Dunk 细节对比图 支持退换 DD1391-100", price: 318, shop: "Sneaker 阿龙", sales: "已售 403", product: "panda", photo: "pC", found: ["lens"], via: ["serpapi"], arrival: 3, group: 2 },

  // Group 3: retail
  { source: "taobao", title: "Nike耐克官方DUNK LOW RETRO男子运动鞋板鞋熊猫配色DD1391-100", price: 799, shop: "Nike官方旗舰店", sales: "月销 2000+", product: "panda", photo: "pD", found: T, via: B, arrival: 1, group: 3, tmall: true },
  { source: "taobao", title: "NIKE DUNK LOW 男子板鞋 黑白熊猫 DD1391-100 正品", price: 849, shop: "滔搏运动官方旗舰店", sales: "月销 500+", product: "panda", photo: "pD", found: T, via: B, arrival: 1, group: 3, tmall: true },
  { source: "taobao", title: "【得物验货】Nike Dunk Low 熊猫 DD1391-100 正品现货 当天发", price: 659, shop: "得物潮流优选", sales: "1000+人付款", product: "panda", photo: "pD", found: T, via: B, arrival: 1, group: 3 },

  // Group 4: kids sizes
  { source: "taobao", title: "Nike Dunk Low GS 熊猫 大童 女鞋 CW1590-100", price: 589, shop: "童鞋专营店", sales: "200+人付款", product: "kids", photo: "pE", found: T, via: B, arrival: 1, group: 4 },
  { source: "1688", title: "童鞋 熊猫配色板鞋 儿童低帮运动鞋 厂家批发", price: 45, shop: "温州童鞋源头", sales: "已售 2.3万件", product: "kids", photo: "pE", found: T, via: B, arrival: 2, group: 4 },
  { source: "taobao", title: "dunk熊猫童鞋 大童 女生 黑白 小码", price: 129, shop: "宝贝鞋柜", sales: "100+人付款", product: "kids", photo: "pE", found: T, via: B, arrival: 1, group: 4 },

  // Group 5: Grey Fog
  { source: "taobao", title: "Nike Dunk Low 灰雾 Grey Fog DD1391-103 现货", price: 279, shop: "潮流鞋铺", sales: "300+人付款", product: "greyfog", photo: "pF", found: T, via: B, arrival: 1, group: 5 },
  { source: "weidian", title: "灰雾Dunk DD1391-103 品质款 原盒", price: 268, shop: "鞋履总代", sales: "已售 920", product: "greyfog", photo: "pF", found: T, via: B, arrival: 2, group: 5 },
  { source: "taobao", title: "dunk low 灰白 灰雾 低帮板鞋 DD1391-103", price: 239, shop: "潮流前线Sneaker", sales: "100+人付款", product: "greyfog", photo: "pF", found: ["lens"], via: ["serpapi"], arrival: 3, group: 5 },

  // Group 6: Jordan 1 Low Panda
  { source: "1688", title: "AJ1低帮熊猫 黑白板鞋 源头工厂 跨境专供", price: 85, shop: "晋江市鸿运鞋业", sales: "已售 5400件", product: "jordan", photo: "pG", found: T, via: B, arrival: 2, group: 6 },
  { source: "1688", title: "乔丹1代低帮 黑白熊猫 男女篮球鞋 一件代发", price: 88, shop: "晋江鞋都源头工厂", sales: "已售 3100件", product: "jordan", photo: "pG", found: T, via: B, arrival: 2, group: 6 },
  { source: "taobao", title: "Air Jordan 1 Low 熊猫 黑白 553558-040 低帮篮球鞋", price: 329, shop: "AJ潮品馆", sales: "500+人付款", product: "jordan", photo: "pG", found: T, via: B, arrival: 1, group: 6 },
  { source: "taobao", title: "AJ1 Low 熊猫配色 低帮 553558-040 男女同款", price: 299, shop: "阿杰潮鞋工作室", sales: "200+人付款", product: "jordan", photo: "pG", found: T, via: B, arrival: 1, group: 6 },

  // Single listings
  { source: "taobao", title: "Nike Dunk Low 熊猫 DD1391-100 实拍 上脚图 鞋盒齐全", price: 259, shop: "Kicks实拍馆", sales: "50+人付款", product: "panda", photo: "s1", found: T, via: B, arrival: 1 },
  { source: "taobao", title: "dunk low 熊猫 黑白 男款 41码 只穿过一次 闲置", price: 230, shop: "闲置小铺", sales: null, product: "panda", photo: null, found: T, via: B, arrival: 1 },
  { source: "weidian", title: "OG 熊猫Dunk DD1391-100 [支持验货] 包邮", price: 345, shop: "OG Sneakers", sales: "已售 210", product: "panda", photo: "s3", found: T, via: B, arrival: 2 },
  { source: "yupoo", title: "Dunk Low Panda Black White 2024 Version", price: 240, shop: "example-store", sales: null, product: "panda", photo: "s4", found: ["store"], via: ["store-index"], arrival: 4, extra: 4, album: "v24" },
  { source: "weidian", title: "熊猫 2024版 购买链接 拍下备注尺码", price: 236, shop: "example-store 微店", sales: "已售 57", product: "panda", photo: "s4", found: ["store"], via: ["store-index"], arrival: 4, albumOf: "v24" },
  { source: "yupoo", title: "Nike SB Dunk Low Black White", price: null, shop: "sample-kicks", sales: null, product: "panda", photo: "s5", found: ["store"], via: ["store-index"], arrival: 4, extra: 3, album: "sb" },
  { source: "1688", title: "黑白配色休闲板鞋 低帮 学生 男女 外贸 爆款", price: 58, shop: "广州白云区鞋业", sales: "已售 6400件", product: "generic", photo: "s6", found: T, via: B, arrival: 2 },
  { source: "taobao", title: "Nike Dunk Low 海军蓝 Navy DD1391-400 低帮", price: 279, shop: "鞋匠阿明", sales: "100+人付款", product: "navy", photo: "s7", found: T, via: B, arrival: 1 },
  { source: "taobao", title: "Dunk Low 绿白 Varsity Green 低帮复古", price: 269, shop: "潮流前线Sneaker", sales: "200+人付款", product: "green", photo: "s8", found: T, via: B, arrival: 1 },
  { source: "weidian", title: "Dunk Low 复古绿 白绿 DD1391-101 现货", price: 285, shop: "老K鞋馆", sales: "已售 330", product: "green", photo: "s9", found: T, via: B, arrival: 2 },
  { source: "taobao", title: "Air Force 1 空军一号 纯白 低帮 315122-111", price: 199, shop: "AJ潮品馆", sales: "3000+人付款", product: "af1", photo: "s10", found: T, via: B, arrival: 1 },
  { source: "1688", title: "小白鞋 空军一号同款 低帮板鞋 厂家直销", price: 39, shop: "广州白云区鞋业", sales: "已售 4.1万件", product: "af1", photo: "s11", found: T, via: B, arrival: 2 },
  { source: "taobao", title: "黑白熊猫 帆布鞋 低帮 学生 百搭", price: 49, shop: "帆布鞋小站", sales: "1000+人付款", product: "canvas", photo: "s12", found: T, via: B, arrival: 1 },
  { source: "taobao", title: "熊猫鞋 老爹鞋 增高 黑白 厚底", price: 89, shop: "增高鞋专营", sales: "600+人付款", product: "chunky", photo: "s13", found: T, via: B, arrival: 1 },
  { source: "1688", title: "儿童熊猫图案拖鞋 卡通 居家", price: 12, shop: "义乌小商品城", sales: "已售 9.8万件", product: "slipper", photo: "s14", found: T, via: B, arrival: 2 },
  { source: "weidian", title: "Dunk Low 熊猫 鞋带 替换 黑白 一对", price: 15, shop: "鞋带专卖", sales: "已售 1200", product: "laces", photo: "s15", found: T, via: B, arrival: 2 },
  { source: "yupoo", title: "Dunk Low Grey Fog DD1391-103", price: 250, shop: "sample-kicks", sales: null, product: "greyfog", photo: "s16", found: ["store"], via: ["store-index"], arrival: 4, extra: 4, album: "fog" },
  { source: "taobao", title: "Nike Dunk Low Retro 熊猫 DD1391-100 毒验 全新", price: 620, shop: "全新正品折扣店", sales: "20+人付款", product: "panda", photo: "s17", found: ["lens"], via: ["serpapi"], arrival: 3 },
  { source: "1688", title: "DD1391-100 熊猫 现货 渠道 批发 支持一件", price: 210, shop: "晋江鞋业工厂店", sales: "已售 980件", product: "panda", photo: "s18", found: T, via: B, arrival: 2 },
  { source: "weidian", title: "熊猫Dunk 女款 小码 35.5-39", price: 255, shop: "Sneaker 阿龙", sales: "已售 88", product: "panda", photo: "broken", found: T, via: B, arrival: 2 },

  // Only found by Taobao photo search (needs a Taobao login)
  { source: "taobao", title: "同款熊猫低帮板鞋 黑白 男女", price: 139, shop: "百搭鞋铺", sales: "400+人付款", product: "panda", photo: "s19", found: ["image"], via: B, arrival: 1, taobaoImage: true },
  { source: "taobao", title: "熊猫配色运动板鞋 休闲", price: 159, shop: "运动潮鞋馆", sales: "90+人付款", product: "generic", photo: "s20", found: ["image"], via: B, arrival: 1, taobaoImage: true },
  { source: "taobao", title: "Dunk 熊猫 实拍 好质量 DD1391-100", price: 219, shop: "Kicks实拍馆", sales: "60+人付款", product: "panda", photo: "s21", found: ["image"], via: B, arrival: 1, taobaoImage: true },
];

// ---------------------------------------------------------------------------
// Ranking (a small imitation of the backend's)

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

const rand = rng(1688);
const PHOTO_NOISE: Record<string, number> = {};
function photoNoise(photo: string): number {
  return (PHOTO_NOISE[photo] ??= (rand() - 0.5) * 0.07);
}

function nativeId(source: Source, i: number): string {
  const r = rng(i * 7919 + source.length * 104729);
  const digits = (n: number) => Array.from({ length: n }, (_, k) => (k === 0 ? 1 + Math.floor(r() * 9) : Math.floor(r() * 10))).join("");
  switch (source) {
    case "taobao":
      return digits(12);
    case "1688":
      return digits(12);
    case "weidian":
      return digits(10);
    case "yupoo":
      return digits(9);
  }
}

function urlFor(s: Seed, id: string): string {
  switch (s.source) {
    case "taobao":
      return s.tmall ? `https://detail.tmall.com/item.htm?id=${id}` : `https://item.taobao.com/item.htm?id=${id}`;
    case "1688":
      return `https://detail.1688.com/offer/${id}.html`;
    case "weidian":
      return `https://weidian.com/item.html?itemID=${id}`;
    case "yupoo":
      return `https://${s.shop}.x.yupoo.com/albums/${id}?uid=1`;
  }
}

function textScore(title: string): number {
  let s = 0.15;
  if (/DD1391-100/i.test(title)) s += 0.45;
  if (/熊猫|panda/i.test(title)) s += 0.25;
  if (/dunk/i.test(title)) s += 0.2;
  return Math.min(1, s);
}

function tierFor(score: number): Tier {
  if (score >= 0.85) return "exact";
  if (score >= 0.7) return "close";
  if (score >= 0.5) return "similar";
  return "weak";
}

/** Yupoo album covers are often a store banner rather than the item; match_key points at the real photo. */
function coverSvg(store: string, n: number): string {
  const bg = ["#1f2937", "#3f3a36", "#27323a"][n % 3];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="400" height="400"><rect width="200" height="200" fill="${bg}"/><rect x="16" y="16" width="168" height="168" fill="none" stroke="rgba(255,255,255,.25)"/><text x="100" y="92" fill="#fff" font-family="Helvetica,Arial,sans-serif" font-size="17" font-weight="700" text-anchor="middle">${store.toUpperCase()}</text><text x="100" y="116" fill="rgba(255,255,255,.7)" font-family="Helvetica,Arial,sans-serif" font-size="10" letter-spacing="2" text-anchor="middle">TOP QUALITY · QC PHOTOS</text></svg>`;
}

interface Prepared {
  seed: Seed;
  index: number;
  code: string | null;
  base: Omit<Listing, "image_score" | "score" | "tier" | "verdict" | "verdict_note" | "group">;
}

const STYLE_CODE = /\b(?:[A-Z]{2}\d{4}|\d{6})-\d{3}\b/i;

const PREPARED: Prepared[] = SEEDS.map((seed, i) => {
  const native = nativeId(seed.source, i + 1);
  const photoKey = seed.photo == null ? null : seed.photo === "broken" ? "mock/broken" : `mock/${seed.photo}`;
  const names = Object.keys(PHOTO_LOOK);
  const others = Array.from({ length: Math.max(0, (seed.extra ?? 0) - 1) }, (_, k) => `mock/${names[(i * 3 + k * 5) % names.length]}`);
  let imageKey = photoKey;
  let extraKeys: string[] = [];
  let matchKey: string | null = photoKey;
  if (seed.source === "yupoo" && seed.extra) {
    imageKey = `mock/cover-${i}`;
    mockImages[imageKey] = uri(coverSvg(seed.shop ?? "yupoo", i));
    extraKeys = photoKey ? [photoKey, ...others] : others;
  }
  if (seed.photo === "broken") matchKey = null;
  return {
    seed,
    index: i,
    code: seed.title.match(STYLE_CODE)?.[0].toUpperCase() ?? null,
    base: {
      id: `${seed.source}:${native}`,
      source: seed.source,
      native_id: native,
      url: urlFor(seed, native),
      title: seed.title,
      image_url: `https://img.example.invalid/${native}.jpg`,
      image_key: imageKey,
      price_cny: seed.price,
      shop: seed.shop,
      sales: seed.sales,
      found_by: seed.found,
      via: seed.via,
      text_score: textScore(seed.title),
      extra_keys: extraKeys,
      match_key: matchKey,
      albums: [],
    },
  };
});
// Buy links point back at the Yupoo albums they were found in.
for (const p of PREPARED) {
  if (!p.seed.albumOf) continue;
  const album = PREPARED.find((a) => a.seed.album === p.seed.albumOf);
  if (album) p.base.albums = [album.base.id];
}

export interface RankInput {
  refs: RefSeed[];
  arrived: number; // highest arrival batch included
  taobaoImage: boolean; // Taobao photo search ran
  verified: boolean; // AI check done
}

const TIER_ORDER: Tier[] = ["exact", "close", "similar", "weak"];

export function rank({ refs, arrived, taobaoImage, verified }: RankInput): { listings: Listing[]; groups: Group[] } {
  const selected = refs.filter((r) => r.selected);
  const kinds: RefKind[] = selected.length ? selected.map((r) => r.kind) : ["panda"];
  const included = PREPARED.filter(({ seed }) => seed.arrival <= arrived && (!seed.taobaoImage || taobaoImage));
  const prepById = new Map(included.map((p) => [p.base.id, p]));

  const listings: Listing[] = included.map(({ seed, base }) => {
    const noise = photoNoise(seed.photo ?? base.id);
    const imageScore = Math.max(...kinds.map((k) => SIM[seed.product][k])) + noise;
    const score = Math.max(0, Math.min(1, ((imageScore - 0.25) / 0.7) * 0.85 + base.text_score * 0.15));
    const foundBy: Method[] =
      taobaoImage && seed.source === "taobao" && seed.product === "panda" && !base.found_by.includes("image")
        ? [...base.found_by, "image"]
        : base.found_by;
    return {
      ...base,
      found_by: foundBy,
      albums: base.albums.filter((a) => prepById.has(a)),
      image_score: Math.round(imageScore * 1000) / 1000,
      score: Math.round(score * 1000) / 1000,
      tier: tierFor(score),
      verdict: null,
      verdict_note: "",
      group: -1,
    };
  });
  listings.sort((a, b) => b.score - a.score);

  if (verified) {
    for (const l of listings.slice(0, 24)) {
      const [verdict, note] = VERDICT[prepById.get(l.id)!.seed.product];
      l.verdict = verdict;
      l.verdict_note = note;
      // A "variant" verdict caps the tier at "similar".
      if (verdict === "variant" && TIER_ORDER.indexOf(l.tier) < TIER_ORDER.indexOf("similar")) l.tier = "similar";
    }
  }

  // Group like the backend: same photo batch, same style code, or album + its buy link.
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const p = parent.get(id) ?? id;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  const firstBy = new Map<string, string>();
  for (const l of listings) {
    const p = prepById.get(l.id)!;
    const keys = [p.seed.group != null ? `g${p.seed.group}` : null, p.code ? `c${p.code}` : null];
    for (const k of keys) {
      if (!k) continue;
      const first = firstBy.get(k);
      if (first) union(first, l.id);
      else firstBy.set(k, l.id);
    }
    for (const album of l.albums) union(album, l.id);
  }

  const members = new Map<string, Listing[]>();
  for (const l of listings) {
    const root = find(l.id);
    if (!members.has(root)) members.set(root, []);
    members.get(root)!.push(l);
  }
  const groups: Group[] = [];
  for (const ls of members.values()) {
    // Stable id: the lowest fixture index in the group.
    const id = Math.min(...ls.map((l) => prepById.get(l.id)!.index));
    for (const l of ls) l.group = id;
    const prices = ls.map((l) => l.price_cny).filter((p): p is number => p != null);
    groups.push({
      id,
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

/** Listing counts per source+method, for SourceStatus.count. */
export function countFound(source: SourceStatus["source"], method: Method, listings: Listing[]): number {
  if (source === "google") return listings.filter((l) => l.found_by.includes("lens")).length;
  return listings.filter((l) => l.source === source && l.found_by.includes(method)).length;
}

export type RefSeedList = RefSeed[];
