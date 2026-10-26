/** Rough word-by-word English for the mock (`?mock=1`); the real backend asks the AI. */
const WORDS: Record<string, string> = {
  人付款: "bought", 已售: "sold", 月销: "sold/month", 件: "",
  耐克: "Nike", 阿迪达斯: "Adidas", 萨洛蒙: "Salomon", 露露乐蒙: "Lululemon", 迪凯斯: "Dickies",
  熊猫: "Panda", 黑白: "black/white", 黑色: "black", 纯白: "white", 黄色: "yellow", 红色: "red",
  蓝色: "blue", 绿色: "green", 紫色: "purple", 粉色: "pink", 米色: "beige", 藏青: "navy", 灰雾: "fog grey",
  配色: "colorway", 低帮: "low-top", 板鞋: "skate shoes", 运动鞋: "sneakers", 老爹鞋: "dad shoes",
  越野跑鞋: "trail running shoes", 靴子: "boots", 鞋带: "laces", 鞋盒齐全: "with full box",
  男女同款: "unisex", 男女: "men's/women's", 男款: "men's", 女款: "women's", 情侣款: "couples",
  大童: "big kids", 学生: "students", 小码: "small sizes",
  纯原: "top batch", 顶级版本: "top-tier version", 高仿: "replica", 精品: "premium", 实拍: "real photos",
  支持验货: "inspection OK", 顺丰包邮: "free SF shipping", 一件代发: "dropshipping", 跨境货源: "cross-border supply",
  官方旗舰店: "Official Flagship Store", 官方: "official", 旗舰店: "Flagship Store", 工厂店: "Factory Store",
  工厂直销: "factory direct", 源头工厂: "source factory", 工作室: "Studio", 鞋业: "Shoe Co.", 鞋馆: "Shoe Hall",
  鞋铺: "Shoe Shop", 潮鞋: "trendy shoes", 潮牌: "streetwear", 潮品馆: "Trend Hall", 店: "Shop",
  莆田: "Putian", 晋江: "Jinjiang", 广州: "Guangzhou", 白云区: "Baiyun",
  连帽卫衣: "hoodie", 卫衣: "sweatshirt", 羽绒服: "down jacket", 西装外套: "blazer", 飞行员夹克: "bomber jacket",
  夹克: "jacket", 外套: "coat", 衬衫: "shirt", 腰带: "belt", 重磅: "heavyweight", 纯棉: "cotton",
  羊绒: "cashmere", 羊毛: "wool", 防水: "waterproof", 阔腿: "wide-leg", 锥形: "tapered",
  百搭: "versatile", 高级感: "premium look", 美式复古: "American vintage", 韩系: "Korean style",
  老钱风: "old money", 静奢风: "quiet luxury", 街头: "street", 运动休闲: "athleisure", 同款: "same style",
  闲置: "second-hand", 基础款: "basics", 脚长: "foot length", 童鞋: "kids' shoes", 胸围: "chest", 腰围: "waist", 童装: "kids' clothes",
  正品: "genuine", 现货: "in stock", 精选: "selected", 品质款: "quality version", 新款: "new", 鞋履总代: "Footwear Distributor",
};
const KEYS = Object.keys(WORDS).sort((a, b) => b.length - a.length);
const CJK = /[㐀-鿿]/;

export function mockEnglish(text: string): string | null {
  const rules: [RegExp, string][] = [
    [/^(\d+(?:\.\d+)?)(万)?(\+?)人付款$/, "bought"],
    [/^(\d+(?:\.\d+)?)(万)?(\+?)人收货$/, "received"],
    [/^(?:月销|月售)\s*(\d+(?:\.\d+)?)(万)?(\+?)(?:件|笔)?$/, "sold this month"],
    [/^已售\s*(\d+(?:\.\d+)?)(万)?(\+?)(?:件)?$/, "sold"],
  ];
  for (const [pattern, suffix] of rules) {
    const m = text.match(pattern);
    if (m) return `${(Number(m[1]) * (m[2] ? 10000 : 1)).toLocaleString("en-US", { maximumFractionDigits: 0 })}${m[3]} ${suffix}`;
  }
  // "check the foot length (脚长)": the Chinese in brackets only repeats the English.
  text = text.replace(/\s*[（(]\s*[\u3400-\u9fff]+\s*[)）]/g, "");
  let out = "";
  let i = 0;
  while (i < text.length) {
    const key = CJK.test(text[i]) ? KEYS.find((k) => text.startsWith(k, i)) : undefined;
    if (key) {
      out += ` ${WORDS[key]} `;
      i += key.length;
    } else {
      // Unknown Chinese characters are dropped; everything else is kept.
      if (!CJK.test(text[i])) out += text[i];
      i++;
    }
  }
  const english = out.replace(/【/g, "[").replace(/】/g, "]").replace(/\(\s*\)/g, "").replace(/\s+/g, " ").trim();
  return /[a-z]/i.test(english) ? english : null;
}
