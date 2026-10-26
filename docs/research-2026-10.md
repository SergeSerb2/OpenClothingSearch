# Chinese marketplace product search: technical research

**As of 2026-10-24.** Prices are **USD**, unless marked CNY; taxes are excluded. “Documented” means current public documentation or an accessible product page, **not a successful authenticated API test**. Where pricing, eligibility, or coverage could not be verified, that is stated explicitly.

The practical conclusions are:

- **Google reference-image retrieval is inexpensive.** Serper and DataForSEO are the strongest budget options.
- **Taobao/Tmall and 1688 have usable third-party image-search APIs.** Image upload, account eligibility, and separate upload charges need attention.
- **Weidian and Yupoo are the coverage gaps.** Accepting their product URLs does not establish that a service can search their entire catalogs.
- **Google Lens is supplementary discovery.** I found no reproducible evidence that its API results reliably cover all five requested marketplaces.
- **Local ranking on Apple Silicon is feasible.** Candidate discovery and exact product identification remain separate problems.

## 1. Text → reference images

### Providers, availability, access, and costs

For the international services below, **no Chinese phone number or Chinese business license is required by their published onboarding**. Ordinary account verification and paid billing requirements still apply.

| Option | How it works / endpoint | Availability in October 2026 | Cost and free allowance | Access, limits, and reliability |
|---|---|---|---|---|
| **Google Custom Search JSON API** | Google Programmable Search engine; `GET https://customsearch.googleapis.com/customsearch/v1`, with `cx`, `q`, and `searchType=image`. | **Closed to new customers. Existing customers must migrate before January 1, 2027.** | Existing customers: **100 queries/day free**, then **$5/1,000**, maximum 10,000/day. | Google account, API key, configured search engine; billing for paid usage. Maximum 10 results/request and 100 results/query. Official API, but unsuitable for a new project because of closure. [Overview](https://developers.google.com/custom-search/v1/overview), [request reference](https://developers.google.com/custom-search/v1/reference/rest/v1/cse/list). |
| **Vertex AI Search / Agent Search** | Searches imported data and configured websites through Discovery Engine serving configurations. | Available, but **not a drop-in Google Images API**. Google positions it as an alternative for searching up to 50 domains. | Published search tiers include **$1.50/1,000 Standard**, **$4/1,000 Enterprise**, with a 10,000-query monthly free-trial allowance; storage can cost extra. | Google Cloud project, authentication and billing. Published regional search quota includes 300 requests/minute/project/location. These prices do **not** purchase unrestricted Google Images access. [Documentation](https://docs.cloud.google.com/generative-ai-app-builder/docs), [pricing](https://cloud.google.com/generative-ai-app-builder/pricing?hl=en), [quotas](https://docs.cloud.google.com/generative-ai-app-builder/quotas?hl=en). |
| **SerpAPI Google Images** | Managed Google scraper: `https://serpapi.com/search?engine=google_images&q=...`. | Actively documented. Returns source pages, image URLs and thumbnails. | **250/month free**; **$25/1,000**, **$75/5,000**, **$150/15,000** monthly plans. | Account/API key; paid billing. Throughput: free 50/hour; Starter 200/hour; Developer 1,000/hour. Handles Google access and parsing; still exposed to upstream layout changes. [Images API](https://serpapi.com/google-images-api), [pricing](https://serpapi.com/pricing). |
| **Serper.dev Images** | `POST https://google.serper.dev/images`; query, country/language and pagination parameters. | Available. | **2,500 signup credits free, no card**. Starter **$50/50,000 credits**, valid **six months**. Images use one credit in an August 2026 developer observation. | Email/API key; paid cards or PayPal. Starter 50 queries/second. Managed scraping; vendor quotes roughly 1–2 seconds, not an independent latency measurement. [Provider](https://serper.dev/), [observed endpoint/credit behavior](https://gist.github.com/eric6356/abe459018387c5419d103244c9daf5d7). |
| **SearchAPI.io Google Images** | `GET https://www.searchapi.io/api/v1/search?engine=google_images&q=...`. | Available. | **100 trial searches, no card**; **$40/month/10,000**; $100/35,000. | API key; paid billing. Hourly throughput generally 20% of monthly allowance: 2,000/hour on Developer. Published 99.9% SLA; managed proxies/parsing. [API](https://www.searchapi.io/docs/google-images), [pricing](https://www.searchapi.io/pricing). |
| **Scrapingdog** | `https://api.scrapingdog.com/google_images?api_key=...&query=...&page=0&country=us`. | Available; image-search guide updated April 2026. | Pricing page: **100 trial credits**, no card. Lite **$40/month/200,000 credits**. **Google Images costs 10 credits/request**, so Lite buys approximately 20,000 image requests. | API key. Lite five concurrent requests; higher plans increase concurrency. Credit accounting is important; “200,000 credits” does not mean 200,000 image searches. [2026 guide](https://www.scrapingdog.com/blog/scrape-google-images/), [pricing](https://www.scrapingdog.com/pricing/), [credit documentation](https://www.scrapingdog.com/documentation/index.html). |
| **DataForSEO Google Images** | Live: `POST https://api.dataforseo.com/v3/serp/google/images/live/advanced`; queued `task_post`/`task_get` alternatives. | Available. | Approximately **$0.60/1,000 standard queued**, **$1.20/1,000 priority queued**, **$2/1,000 Live**. **$1 trial credit**; **$50 minimum deposit**, balance does not expire. | Account/API credentials and prepaid funding. Documentation permits up to 10,000 API calls/minute; endpoint/task limits also apply. Standard queue takes minutes; Live is suitable for interactive use. [Image pricing](https://dataforseo.com/apis/serp-api/google-images-api), [Live endpoint](https://docs.dataforseo.com/v3/serp-images-live-advanced/), [account FAQ](https://dataforseo.com/faq). |
| **Brave Image Search** | Independent index: `GET https://api.search.brave.com/res/v1/images/search?q=...`; subscription-token header. | Available, but results are **Brave’s**, not Google’s. | Current Search pricing: **$5/1,000 requests**, **$5 recurring monthly credit**—roughly 1,000 free requests/month. | **Card required** to obtain recurring free credit. Published 50 requests/second. Up to 200 image results; no pagination. Older articles describing 2,000 free searches or $3/1,000 reflect previous plans. [Pricing](https://api-dashboard.search.brave.com/documentation/pricing), [card requirement](https://api-dashboard.search.brave.com/documentation/resources/help-feedback), [image endpoint](https://api-dashboard.search.brave.com/api-reference/images/image_search). |
| **Bing Image Search API** | Former Azure Bing Search API. | **Retired August 11, 2025**, including existing instances; unavailable for new development. | No current purchasable API/free tier. | “Grounding with Bing Search” is not an Image Search replacement. Third-party Bing scrapers are separate products. [Microsoft retirement notice](https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement). |
| **Playwright scraping Google Images** | Browser search, commonly `https://www.google.com/search?udm=2&q=...`; older URLs use `tbm=isch`. | Technically possible; no stable extraction contract. | No API fee or published free quota. Browser operation, proxies and maintenance are the actual costs. | Often works without login initially; consent screens, CAPTCHAs, lazy loading and changing markup interrupt automation. No dependable “safe requests/day” figure. A managed API is usually cheaper in developer time. [2026 scraper discussion](https://www.scrapingdog.com/blog/scrape-google-images/). |

**Correction to the question’s date:** I confirmed the closure and **January 1, 2027** shutdown deadline, but **could not substantiate that Google closed the JSON API to new customers in 2025**. The dated official transition announcement I found is **January 20, 2026**. It also says new search engines must use designated sites. [Google announcement](https://programmablesearchengine.googleblog.com/2026/01/).

### Cheapest reliable choice at 20–200 searches/day

Assuming one image-search request per item, approximately **600–6,000 requests/month**:

| Provider | Monthly usage cost | Cash/minimum-spend caveat |
|---|---:|---|
| DataForSEO Live | **$1.20–$12** | $50 initial deposit; unused funds do not expire. |
| DataForSEO standard queued | **$0.36–$3.60** | Minutes of latency; unsuitable for an immediate interactive response. |
| Serper Images | **$0.60–$6 nominal credit consumption** | $50 purchase expires after six months: effectively **$8.33/month minimum** for continuing paid access at low usage. |
| Brave | Approximately **$0–$25** after monthly credit | Cheapest at low volume if Google-specific results are unnecessary. |

**Pick DataForSEO Live for inexpensive Google Images alone; pick Serper when its credit pool will also fund Lens and ordinary Google searches.** DataForSEO charges **five times the normal price for supported search operators such as `site:`**, which matters for domain-targeted discovery. [Operator pricing](https://dataforseo.com/help-center/serp-api-cost-explained).

## 2. Reverse-image search returning marketplace listings

### Google Lens, Yandex and Bing

| Option | Image / combined-query interface | Current availability | Cost, signup and limits | Reliability and coverage |
|---|---|---|---|---|
| **SerpAPI Google Lens** | `engine=google_lens`, public image `url`, `type=visual_matches`; optional **`q` combines image and text**. An uploaded `image_id` is also supported. | Available. File-upload support was added August 2026. | Uses SerpAPI allowances and hourly limits above; account/API key, no Chinese credentials. | Returns `visual_matches` with destination links. Cache lasts one hour; identical cached requests are free. **Products-tab searches are no longer dependable.** [Lens reference](https://serpapi.com/google-lens-api). |
| **SearchAPI Google Lens** | `engine=google_lens&url=...&search_type=visual_matches`; optional **`q`**. | Available. Documentation explicitly says the **Products tab disappeared October 7, 2026**. | Same SearchAPI trial/plans above. | Visual matches may contain price/stock, but are not a dedicated marketplace catalog. Exact-match redirects can require link resolution. [Current breaking-change notice](https://www.searchapi.io/docs/google-lens). |
| **Serper Lens** | Observed `POST https://google.serper.dev/lens`, public image `url`, country/language. | Working in a documented August 8, 2026 developer observation; less completely documented publicly than the preceding services. | Observation reports **three credits/search**, approximately **$3/1,000** at Starter pricing; shares the Serper credit pool. | I did **not** verify equivalent text-plus-image refinement or a guaranteed `visual_matches` response schema. Treat its shape and credit cost as observed behavior to recheck. [Developer observation](https://gist.github.com/eric6356/abe459018387c5419d103244c9daf5d7). |
| **Official Yandex Search API** | `POST https://searchapi.api.cloud.yandex.net/v2/image/search_by_image`; accepts URL, image data or prior image identifier; supports a site restriction. | **An official API does exist**: reference dated July 2025 and operational guide updated January 2026. | Approximately **$7.50/1,000 image requests**; published reverse-image quotas **10/second, 36,000/hour**. | Yandex account, billing identity/contact phone and payment onboarding. No Chinese credentials. **Account/payment acceptance outside China was not confirmed**; foreign billing may require manual approval. [Endpoint](https://yandex.cloud/ru/docs/search-api/api-ref/ImageSearch/searchByImage), [pricing](https://aistudio.yandex.ru/en/docs/search-api/pricing), [limits](https://aistudio.yandex.ru/en/docs/search-api/concepts/limits), [foreign billing](https://yandex.cloud/en/docs/billing/qa/non-resident). |
| **Yandex through SearchAPI / SerpAPI** | SearchAPI: `engine=yandex_reverse_image&url=...`. SerpAPI: `engine=yandex_images&url=...&tab=similar`. | Both documented. | Their normal subscriptions/quotas; avoids opening a direct Yandex billing account. | Scraped Yandex results, not privileged Chinese-marketplace access. [SearchAPI](https://www.searchapi.io/docs/yandex-reverse-image-api), [SerpAPI](https://serpapi.com/yandex-reverse-image-api). |
| **Official Bing Visual Search** | Former Microsoft API. | **Retired with Bing Search APIs in August 2025.** | Unavailable. | Do not confuse the still-accessible Bing website with the retired API. [Microsoft confirmation including Visual Search](https://learn.microsoft.com/en-us/answers/questions/5538194/is-there-any-free-plan-for-bing-search-api). |
| **Bing reverse image through SerpAPI** | `engine=bing_reverse_image&image_url=...`; market and pagination options. | Still documented because it accesses the public Bing experience. | Normal SerpAPI pricing; documented maximum 150 results/request and image-edge limits of 4,000 pixels. | Independent of the retired Azure product, but remains dependent on Bing’s website. [API reference](https://serpapi.com/bing-reverse-image-api). |

**Recent operational evidence:** SerpAPI’s release notes report Products searches returning no results on **October 9, 2026**, and fixes for verification responses and increased failures on **October 21**. Lens is actively maintained, but this is evidence of upstream instability, not a reason to assume uninterrupted availability. [Release notes](https://serpapi.com/google-lens-api/release-notes).

### Do Lens visual matches include the requested domains?

For **`taobao.com` / `item.taobao.com`, `weidian.com`, `1688.com`, and `*.x.yupoo.com`**, the responsible answer is:

> They can only appear when the search engine discovers an accessible, indexed matching page. I found **no reproducible public API response demonstrating dependable coverage of all these domains**, and no provider promises that coverage.

Specific evidence has narrower implications:

- A **September 26, 2026 first-person report** describes obtaining Taobao links from **Google Images** before a login redirect. That demonstrates some Google discovery, **not Lens API coverage**. [Report](https://www.reddit.com/r/taobao/comments/1wqui4j/is_it_practically_possible_to_downloaduse_taobao/).
- AiPrice’s **May 2026 extension** advertises Google Lens, Yandex and Chinese-marketplace image sourcing. It combines tools; its description does not establish that the Chinese listings came from Lens itself. [Publisher’s extension listing](https://microsoftedge.microsoft.com/addons/detail/aliprice-for-google-lens/hlpnmmihojhklaidnanipgcbbheaafgo?hl=en-US).
- Community recommendations frequently describe Lens finding a product’s name or retail original, followed by a **separate native Taobao/1688 search**. That is a useful workflow, but weaker than automatic marketplace-listing retrieval.

Use Lens for **extra candidates, product-name identification and reference-image expansion**. Filter returned destination domains yourself. A text refinement such as a model name is documented; treating `site:` inside Lens as a guaranteed marketplace filter is **unverified**.

## 3. Taobao/Tmall: official APIs, data vendors, agents and scraping

### Official Taobao Open Platform

I did **not** find a currently documented, self-service entitlement allowing an ordinary overseas individual to register a TOP app and immediately perform unrestricted **Pailitao / 拍立淘** searches.

Important distinctions:

- Official affiliate APIs such as **`taobao.tbk.dg.material.optional`** expose particular affiliate inventories and permissions. They are not evidence of unrestricted marketplace image search. [Alibaba developer documentation; older/undated](https://developer.alibaba.com/docs/doc.htm?articleId=118419&docType=1&treeId=687).
- Cross-border partner integrations expose routes such as **`/traffic/item/imgsearch`**, but require the corresponding commercial channel, app credentials and authorization.
- **`taobao.item_search_img` on Onebound is Onebound’s API name**, not proof that the same method is publicly available from TOP.
- Requirements vary by application category. I could not confirm one universal Chinese-phone/business-license rule, public per-call price or individual quota for official whole-market image access.

### Third-party APIs

**NP = no verified public current price/quota.** A live documentation page establishes an offered interface, not an independently measured success rate.

| Provider | Verified search capability and concrete interface | Price / trial | Signup, limits and late-2026 caveats |
|---|---|---|---|
| **Elimapi** | Current v2 supports keyword and image search for **Taobao and 1688**: `POST /v2/products/search`, `/v2/products/search-by-image`, `/v2/products/upload-image`, under `https://openapi.elim.asia`. Image search also accepts an optional **`keyword`**. | Individual **$10/month/2,000 requests**; $40/10,000; $70/20,000; $100/30,000. Prepaid **$8/1,000**, **$25/5,000**, **$40/10,000**, valid 90 days. Pricing says **100 one-time free requests**, while an FAQ still says 200. **Image search is excluded from Free.** | Registration asks for individual/company name, email, contact phone and operating website. No explicit Chinese number/license requirement; onboarding from outside China untested. Published payment is **WorldFirst transfer**, not ordinary card checkout. General default limit 100/minute, with endpoint overrides. **Tmall-specific inclusion/filtering needs confirmation.** [API](https://elim.asia/en/docs/product/), [pricing](https://elim.asia/en/pricing/), [registration](https://elim.asia/guides/account/), [limits](https://elim.asia/docs/setup/). |
| **TMAPI — tmapi.top / tmapi.io branding** | Strong primary documentation for **1688 keyword/image search** and Taobao/Tmall **details**. `/1688/search/items`, `/1688/search/image`, `/1688/global/search/image/v2`; conversion through `/1688/tools/image/convert_url`. | Trial calls advertised; **fixed current per-call pricing/free quantity not verified**. Do not rely on unofficial “$8” or “200 monthly free” claims. | API-key account and production contact. Chinese phone/license and payment requirements not clearly published. Concurrency is contractual; documented 503 concurrency and timeout errors. **I did not verify Taobao image/keyword or Weidian discovery endpoints in primary TMAPI docs.** [1688 image search](https://tmapi.top/docs/ali/search/search-items-by-image-url), [conversion](https://tmapi.top/docs/ali/tool-apis/image-url-convert), [Taobao/Tmall details](https://tmapi.top/docs/taobao-tmall/item-detail/get-item-detail-by-url). |
| **Onebound / 万邦 — onebound.cn, o0b.cn** | Documents **Taobao/Tmall keyword, Tmall-only keyword, Pailitao image, 1688 image and Weidian keyword**. Gateway examples: `https://api-gw.onebound.cn/taobao/item_search`, `/taobao/item_search_tmall`, `/taobao/item_search_img`, `/1688/item_search_img`, `/micro/item_search`. | **Current search-call prices and trial quota NP**; quote required. An available price PDF was updated **October 2024** and should not be presented as 2026 image-search pricing. | Vendor key/secret; sales onboarding, no confirmed universal Chinese-number/license requirement. Image method documents `app_ver=1` with uploaded image ID; **`app_ver=2` accepts JPG/PNG image URLs and pagination**. Quotas and cache freshness require clarification. [API catalog](https://open.onebound.cn/help/api/?q=%26b), [Pailitao method](https://open.onebound.cn/help/api/taobao.item_search_img.html), [keyword method](https://open.onebound.cn/help/api/taobao.item_search.html). |
| **RapidAPI listings** | Current catalog includes names such as **Taobao Advanced**, Taobao/1688 offerings and OTAPI providers. Capabilities belong to the individual publisher, not RapidAPI itself. | **Current listing-specific prices, free tiers and rate limits could not be verified sufficiently to quote.** | RapidAPI account; card requirements depend on plan and overages. No Chinese account generally implied by marketplace onboarding. Names such as `taobao-tmall-16882` are not stable product identities. Check for an actual image-upload/search endpoint; a detail API is insufficient. [Current Taobao collection](https://rapidapi.com/collection/taobao). |
| **OTAPI / OpenTrade Commerce** | REST search documents `GET https://rest.otapi.net/v1/{provider}/search`, with image URL, item title and **`is_tmall`** filtering; Taobao and 1688 providers. | Basic **$150 initial funding**, **$0.006/call**, **$150/month minimum**. Standard $0.003/call with $300 initial funding and same minimum. **Photo-search module $170 one-time per provider**; an additional marketplace provider costs $250. Five-day trial. | Name/email/phone/Telegram form; commercial onboarding. Published “no limits” is not a measured QPS guarantee. Current pricing makes it expensive for a hobbyist despite low headline per-call rates. [REST documentation](https://apidoc.otapi.net/), [full pricing](https://otcommerce.com/key-payments/). |
| **DajiAPI / Daji SaaS** | Taobao image: `GET https://openapi.dajisaas.com/taobao/traffic/item/imgsearch`; 1688: `/alibaba/product/imageQuery`. Separate upload methods; keyword searches also documented. | Opened pricing page: **CNY499/month/1,000 billing units/day**, CNY999/3,000, CNY1,499/5,000. **Seven-day trial, 100 units/day.** Search-cache snippets showed different older plans; obtain a written quote. | Requires **your own registered 1688/TaoWorld buyer account and OAuth authorization**, developer activation and app signing. Not an account-free proxy. Taobao image docs warn about non-Alibaba URLs and say no pagination. Billing-unit-to-request equivalence and QPS need confirmation. [Pricing](https://wiki-en.dajisaas.com/pricing), [onboarding](https://wiki-en.dajisaas.com/quickstart), [Taobao image](https://wiki-en.dajisaas.com/taobao/search/image), [1688 image](https://wiki-en.dajisaas.com/1688/search/image). |
| **LovBuy API** | Public 1688 image interface: `POST https://www.lovbuy.com/1688api/searchimg2.php`, with uploaded image ID; optional keyword, pagination and language. | **Current price, free tier and QPS NP**; contact required. | Account/API key. Public API material includes **2019–2021-era content**. Live documentation is not proof of reliable 2026 execution; Taobao image support was not confirmed. [API overview](https://www.lovbuy.com/api.html), [1688 image method](https://www.lovbuy.com/api5.html). |
| **Apify: apivault_labs/1688-image-search** | Taobao and 1688 photo search, one to three images; public URL or uploaded image. Uses **Fatkun’s public interface**, not official marketplace credentials. | Free-plan event rate approximately **$4/1,000 successful photo/marketplace searches**, lower on paid Apify plans; **platform/proxy usage extra**. | Apify account/token and proxy; no Chinese login or supplier API key. Recently updated, but small public usage history. **Taobao rich details currently unavailable**; search cards may contain unresolved advertising links. Both marketplaces share one upstream, so they are not independent fallbacks. [Actor and limitations](https://apify.com/apivault_labs/1688-image-search). |
| **HIOBuy** | Documents keyword/image discovery for Taobao/1688, including `POST /v1/products/search-by-image`. | Commercial quotas/pricing by agreement; no useful public hobby rate. | Website/use-case review and channel authorization or warehouse integration. **Explicitly does not support catalog-only extraction without meaningful procurement activity.** Poor fit for this research-only hobby tool. [Access rules](https://hiobuy.com/en/api-docs), [image endpoint](https://hiobuy.com/zh/api-docs/product-image-search). |

Two implementation-relevant limitations recur:

1. **An arbitrary Google image URL is not necessarily acceptable.** Elim requires an Alibaba-hosted `*.alicdn.com` image or an uploaded image ID; TMAPI supplies a conversion step. Upload/conversion can be an **additional billable request**.
2. A cross-border channel’s returned prices can differ from domestic website prices. Elim explicitly documents this; retain price provenance rather than presenting every API price as the domestic checkout price. [Elim reference](https://elim.asia/en/docs/product/).

Apify itself currently offers **$5/month free platform credit without a card**; Starter is **$19/month plus usage**, including $19 credit. Actor event charges and compute/proxy charges depend on the particular actor. [Platform pricing](https://apify.com/pricing).

### Shopping-agent websites

**Evidence standard:** “Documented” below means the agent’s own guide or visible interface advertises image search. It does **not** mean I successfully executed it, or that every marketplace the agent accepts is searchable by image.

Across these consumer sites, browsing/search generally has no separate advertised fee. **None supplied a verified public image-search API, automation quota or SLA.** Public guides do not establish whether an actual guest image query works; where login behavior was not tested, it remains unknown.

| Agent | Image-search evidence / marketplace scope | Login and current-status assessment |
|---|---|---|
| **CNFans** | Historical search functionality is not sufficient current proof. | Homepage currently displays a **maintenance notice concerning cyberattacks**. Do not select it as a dependable backend now. [Homepage](https://cnfans.com/). |
| **Kakobuy** | Own guide documents photo upload; keyword coverage includes Taobao/Tmall/1688/JD. Other pages accept Weidian links, but **Weidian image discovery is unconfirmed**. | Guide public; guest image execution untested. Documentation differs between site versions. [Guide](https://item2.kakobuy.com/index/information?information_id=3). |
| **AllChinaBuy** | Taobao/Tmall/1688 sourcing advertised; **image-search execution and coverage not confirmed from accessible first-party material**. | Public website; search login behavior unknown. **Separate from ACBuy.** [Site](https://www.allchinabuy.com/en/). |
| **Superbuy** | Image-search UI is reported in current usage guides, but I did not establish marketplace-by-marketplace image coverage from its accessible official guide. | Account needed for shopping; guest image-query requirement unverified. Official guide establishes keyword/link sourcing, not Weidian-wide image search. [Official guide](https://www.superbuy.com/cn/page/guide/shoppingagent/?htag=double11). |
| **Sugargoo** | Its January 2026 guide discusses image search generically; this does **not** prove Sugargoo’s own reverse-image endpoint. | Link import is documented; image coverage/login unknown. [Own guide](https://blog.sugargoo.com/taobao-english-search-guide/). |
| **Hoobuy** | Own beginner guide documents keyword search for Taobao/Tmall/1688. Custom-order image upload should **not** be counted as reverse-image search. | Guide public; actual image search unconfirmed. [Guide](https://hoobuy.com/beginner-guide?stepKey=Custom1). |
| **Mulebuy** | Own guide explicitly documents image upload/paste. Overall product sourcing includes Taobao/Tmall/1688/Weidian; **image coverage per marketplace unspecified**. | Public instructions; account/guest execution untested. Detailed image guide is on an **older 2024 subsite**. [Image guide](https://2024.mulebuy.com/help-center/image-search-function-guidance/), [current site](https://mulebuy.com/blogs/). |
| **ACBuy** | Own shopping guide documents photo search. Keyword/link examples cover Taobao/Tmall/1688; Weidian image discovery unproven. | Public guide; guest execution untested. [Guide](https://www.acbuy.com/shopping-guide). |
| **LitBuy** | Accessible site was a JavaScript shell; **no sufficiently verifiable first-party image-search scope**. | Unknown. [Site](https://litbuy.com/). |
| **OopBuy** | Indexed product interfaces advertise image search; **Weidian-specific reverse search not established**. | Upstream access can require verification: the Apify actor author reports disabling an experimental OopBuy detail adapter after verification appeared. [Example interface](https://oopbuy.com/product/1688/622576235285), [access report](https://apify.com/apivault_labs/1688-image-search). |
| **JoyaGoo** | Own instructions explicitly describe **name/photo results from Taobao, Tmall and 1688**. Generic Weidian/Yupoo link acceptance is broader than this image-search claim. | Public guide/UI; guest image-query execution untested. [Guide](https://mgt.joyagoo.com/help-center/shopping-assistant-guidance/). |
| **Orientdig** | JavaScript shell prevented dependable capability confirmation. | Unknown. [Site](https://orientdig.com/). |
| **Basetao** | Research fetch was blocked; **not evidence that the service is down**, but image scope was not verified. | Unknown. [Site](https://www.basetao.com/). |
| **CSSBuy** | Accessible shell did not establish current image-search behavior or marketplace coverage. | Unknown; do not infer a public API from consumer functionality. [Site](https://www.cssbuy.com/). |
| **Wegobuy** | No current working search established. | Maintained Jadeship extension documentation classifies it as a **defunct legacy agent**. [Maintainer’s repository](https://github.com/cachho/jadeship-browser-extension). |

**Undocumented JSON endpoints:** I found projects discussing agent product-detail endpoints and link conversion, but **no maintained, reproducibly demonstrated public endpoint set for image-searching these agents across Taobao/1688/Weidian**. A relevant project explicitly notes undocumented integrations and access barriers. Copying an agent’s detail request is not evidence of catalog discovery. [Shopping Hub repository](https://github.com/aon082910/shopping-hub).

### Direct Playwright scraping of Taobao/Tmall

The normal keyword URL remains the familiar **`https://s.taobao.com/search?q=...`**. Current open-source projects show that logged-in browser automation is possible, but they also document the limitations:

- **Manual login and human verification remain necessary.** Sinpensar’s Taobao MCP uses Playwright and reports slider challenges rather than promising to solve them automatically. It provides keyword/detail operations, not a proven Pailitao backend. [Repository](https://github.com/Sinpensar/taobao-mcp).
- A second implementation says cookies alone can be insufficient: it retains a **full Chrome profile**, including browser storage and other session state. Its pacing recommendations are not a guaranteed safe rate. [Repository](https://github.com/fanqi99-creator/taobao-mcp-server).
- An October 2026 project reports a successful Taobao self-check using the user’s active Chrome login and signed MTop requests. This is an **author-reported single environment**, not proof of reliability elsewhere. [Current implementation](https://github.com/Vladimir-Human/ru-marketplace-mcp).

**`x5sec`, slider challenges and MTop signing are separate concerns.** A correctly signed H5 request does not confer authorization or eliminate account/IP risk controls. HTTP 200 can contain a punishment redirect or errors such as **`FAIL_SYS_USER_VALIDATE`**, **`RGV587`**, or `x5secdata`; these must not be interpreted as empty search results. [Browser API documentation identifying these responses](https://github.com/yinnho/aginxbrowser/blob/main/docs/API.md).

There is **no verified safe QPS or daily allowance** for scraping. API fees are zero, but session maintenance and manual interruptions make this a poor primary backend for unattended operation.

## 4. 1688 image search

### Official cross-border APIs and AlphaShop

The official cross-border ecosystem is real. The relevant method family includes:

- **`com.alibaba.fenxiao.crossborder / product.search.imageQuery`**
- **`product.image.upload`**
- **`product.search.keywordQuery`**

A public integration uses this gateway pattern:

**`https://gw.open.1688.com/openapi/param2/1/com.alibaba.fenxiao.crossborder/product.search.imageQuery/{APPKEY}`**

It requires app credentials, authorization token and Alibaba request signing. This exact integration evidence comes from a public client implementation, not proof of unrestricted self-service eligibility. [Implementation reference](https://github.com/LeoYeAI/openclaw-master-skills/blob/main/skills/1688-product-search/SKILL.md).

**AlphaShop has current official tooling:** its 2026 skill catalog advertises keyword, image and product-detail search, and its MCP catalog advertises multilingual sourcing. However, I could not verify a universally available individual plan, public search-call tariff, or signup entitlement outside China. [Official skill catalog](https://skill.alphashop.cn/), [official MCP catalog](https://www.alphashop.cn/seller-center/home/mcp-list).

The older official cross-border agreement describes enterprise/organization integrations. It supports the existence of the program, but **does not establish today’s individual eligibility requirements**. Likewise, `global.1688.com` being accessible does not make its backend an unrestricted public API. [Official agreement, **2023**](https://terms.alicdn.com/legal-agreement/terms/b_end_product_protocol/20231024161027594/20231024161027594.html).

### Web image-search flow

The historical browser flow uploads an image, obtains an image identifier, then opens a route such as:

**`https://s.1688.com/youyuan/index.htm?tab=imageSearch&imageId=...&imageIdList=...`**

Keyword search commonly uses:

**`https://s.1688.com/selloffer/offer_search.htm?keywords=...`**

Open-source implementations demonstrate the upload → signed request → search sequence. **Their old MTop upload names and tokens should not be treated as stable public APIs.** Login, CAPTCHA and cloud-IP blocking remain variable. [Example implementation; maintenance status uncertain](https://github.com/Carmenliukang/image_search_products).

### Realistic choice outside China

1. **Third-party API:** Elim, TMAPI or a quoted Onebound plan.
2. **Manual fallback:** 1688’s own interface or **AiPrice**, formerly AliPrice, which currently offers photo sourcing for Taobao/1688.
3. **Official integration:** worthwhile only after confirming onboarding eligibility, authorization and pricing.

AiPrice is a separate company, not an Alibaba API entitlement. Its public consumer interface does not establish a stable free automation quota. [Current AiPrice site](https://www.aiprice.com/).

## 5. Weidian

### What is actually available?

| Route | Verified capability | Cost/access/limits | Important limitation |
|---|---|---|---|
| **Official Weidian Open Platform** | Official platform exists. | App authorization and permissions vary; current whole-market discovery tariff/individual eligibility not verified. | I found **no verified public, self-service whole-market keyword or reverse-image API**. Merchant inventory APIs do not imply global search. [Official platform](https://open.weidian.com/). |
| **Onebound `micro.item_search`** | Documented keyword search returning Weidian item URLs and images: `https://api-gw.onebound.cn/micro/item_search?q=...&page=...`. | Vendor key/secret; **current price, free tier and QPS require a quote**. | A documented keyword option; **no corresponding Weidian image-search method was established**. [Primary method documentation](https://open.onebound.cn/help/api/micro.item_search.html?sso_checked=1). |
| **OTAPI Weidian offering** | Sales page claims keyword and photo search. | Commercial onboarding; obtain explicit Weidian pricing/provisioning confirmation. | **Current REST provider enumeration did not corroborate Weidian.** Treat photo support as a sales claim awaiting a working demonstration. [Product claim](https://otcommerce.com/weidian-api/), [REST docs](https://apidoc.otapi.net/). |
| **TMAPI** | No primary documentation found establishing Weidian discovery. | Unknown. | Do not infer support from broad “Chinese marketplace” descriptions. |
| **HIOBuy** | Weidian URL parsing and item details. | Commercial authorization. | Its guide explicitly limits Weidian to details/import: **no keyword or image discovery**. [Capability guide](https://hiobuy.com/en/guides/product-ids-search-orders-1688-taobao). |
| **Qualit.ly** | Search its **indexed QC/product catalog**, including Weidian. `GET https://backend.qualit.ly/api/v1/products/search?q=...&storefront=weidian&has_qc=true`. | Basic **1,000/month, 30/minute, free**; Pro **$50/month, 25,000/month, 300/minute**. Sign in for API key. | **Not all Weidian inventory.** API docs give more restrictive search-result caps than the pricing page; design conservatively. Discord image search is not evidence of an equivalent public HTTP image endpoint. [API reference](https://qualit.ly/docs), [plans](https://qualit.ly/tiers). |
| **Jadeship** | Public Weidian/Taobao search and separate spreadsheet search. | Free web interface; no verified public API or automation quota. | Useful manual discovery, but website access and curated spreadsheets are not a guaranteed whole-market API. [Weidian search](https://www.jadeship.com/search/weidian), [spreadsheet search](https://www.jadeship.com/search/spreadsheet/lovegobuy). |

Canonical item format:

**`https://weidian.com/item.html?itemID=1234567890`**

A historical mobile endpoint, **`https://thor.weidian.com/faith/search.item/1.7`**, appears in public scraping code tied to **2019 app parameters**. That is useful historical context, **not a defensible 2026 integration recommendation**. [Historical source](https://github.com/py3tools/iaoAndroid).

For an individual, the workable approach is **keyword discovery from a documented vendor or bounded community index, followed by local image ranking**. Agent sites accepting a Weidian URL do not close the reverse-search gap.

## 6. Yupoo seller catalogs

### Global versus per-store search

I found **no official global search API spanning all Yupoo sellers**. There is useful **per-store text search**, with route families including:

- **`https://STORE.x.yupoo.com/search/album?q=QUERY&uid=1`**
- **`https://x.yupoo.com/photos/STORE/search/album?uid=1&q=QUERY`**
- Album pages: **`https://STORE.x.yupoo.com/albums/ALBUM_ID?uid=1`**

These are website routes, not versioned API contracts.

**Yupoo also has native per-store image search.** Its official help says users can upload a photo and search their own or another seller’s gallery, provided that seller has **enabled the feature and synchronized the gallery**. It offers **100 free searches per user**, then paid packages; I did not find a verifiable public package price or API rate limit. Account-based quota applies, but a universal Chinese-phone requirement was not established. [Official help](https://x.yupoo.com/help/kb/5), [official demonstration gallery](https://help.x.yupoo.com/).

### Scraping, image access and costs

Public store/album browsing can work without login; password-protected galleries require the seller-provided password. Image search has separate account/owner-enablement requirements.

Images commonly live under **`photo.yupoo.com`**. Current scraper documentation says a store **`Referer: https://STORE.x.yupoo.com/`** can be necessary to retrieve usable images. This is hotlink handling, **not a guarantee against bot checks**. A Lens provider fetching that image URL may not send the required Referer; downloading once and supplying an accessible cached copy avoids that particular dependency. [Current scraper documentation](https://apify.com/skyfishdev/yupoo-scraper).

| Option | Cost / access | Availability and limits |
|---|---|---|
| **Your own bounded seller index** | No external search-call fee; local storage/download costs. Public galleries need no business license; protected galleries need access. | Maintain a selected seller list and refresh albums. No published Yupoo automation quota; use modest concurrency and preserve failures. Searches then run locally. |
| **Apify `skyfishdev/yupoo-scraper`** | README: **$2.50/1,000 album records**, **$0.18/1,000 rehosted images**, plus tiny start events; platform usage included in its stated event pricing. | API/account-based crawling, not global discovery. Its headline “from” price differs from the README; check the pricing tab before purchase. [Actor](https://apify.com/skyfishdev/yupoo-scraper). |
| **Native Yupoo image search** | **100 free searches/user**, then packages with unverified public pricing. | Per enabled store; no verified public automation interface or SLA. [Help](https://x.yupoo.com/help/kb/5). |

### How people find items across sellers

The usual discovery chain is **seller directories / Reddit W2C posts / spreadsheets / Discord → seller gallery → model or SKU search → album photos → embedded Taobao/Weidian purchase link**.

Examples and boundaries:

- **YupooFinder** and **BrowseYupoo** have 2026 guides, but explicitly describe themselves as guides rather than their own comprehensive image-search engines. [YupooFinder explanation](https://yupoofinder.com/about.html), [BrowseYupoo FAQ](https://browseyupoo.com/faq.html).
- **QC Finder’s October 2026 seller directory** is a curated seller list, not all Yupoo stores. [Directory](https://qc-finder.net/guides/trusted-sellers).
- **Jadeship spreadsheet search**, **FindQC**, and QC-oriented Discord tools expose community-selected products or photos. Coverage depends on what was indexed or submitted. [Jadeship](https://www.jadeship.com/search/spreadsheet/lovegobuy), [FindQC](https://findqc.com/).
- Google queries such as **`site:x.yupoo.com "MODEL OR SKU"`** help discover indexed albums, but miss private, unindexed and ambiguously named items.

A seller-list-based local index is substantially more controllable than assuming a “Yupoo finder” website provides a global API.

## 7. Local product-image similarity on Apple Silicon

### Model choices

**No public benchmark I found establishes a winner specifically for “same shoe SKU across Taobao/Weidian/Yupoo photos with watermarks and changed backgrounds.”** The following are candidates with different strengths, not interchangeable accuracy guarantees.

| Model | Date/license | Why consider it | Apple Silicon / Node practicality |
|---|---|---|---|
| **Marqo Ecommerce Embeddings L / B** | **2024, older**; Apache-2.0. L approximately 652M total parameters/1,024-dimensional embeddings; B approximately 203M/768 dimensions. | Trained for ecommerce retrieval. Strongest task-specific starting point here. Its reported gains are against older baselines, including original SigLIP—not proof of superiority over SigLIP 2 or DINOv3. | Python `open_clip`/Transformers is the straightforward route. **No verified turnkey Transformers.js export for Ecommerce-L** was established. [Model card](https://huggingface.co/Marqo/marqo-ecommerce-embeddings-L). |
| **SigLIP 2** | **February 2025**; Apache-2.0. | Strong general semantic image/text representation; several sizes. A good efficient baseline, especially when product text also matters. | Python Transformers/MPS; community ONNX exports exist, including Base. More straightforward JavaScript path than custom ecommerce architectures. [Official model](https://huggingface.co/google/siglip2-base-patch16-224), [ONNX export](https://huggingface.co/onnx-community/siglip2-base-patch16-224-ONNX). |
| **DINOv3** | **August 2025**; **custom DINOv3 license**, gated official weight access. | Image-only global and dense patch features. Particularly interesting for shape/detail comparison and reranking visually similar products. No native text tower in the basic backbone. | Python Transformers supports it; start with ViT-S/B rather than the largest models. Community ONNX exports exist. Verify license/access before distribution. [Official repository](https://github.com/facebookresearch/dinov3), [Meta announcement](https://ai.meta.com/blog/dinov3-self-supervised-vision-model/), [ONNX example](https://huggingface.co/onnx-community/dinov3-vitb16-pretrain-lvd1689m-ONNX). |
| **DINOv2** | **2023, older**; Apache-2.0. | Mature image-only baseline; useful where local visual details matter. | Established PyTorch path and available exports; smaller variants suit modest Macs. [Official repository](https://github.com/facebookresearch/dinov2). |
| **OpenCLIP / CLIP variants** | Original CLIP **2021**, with subsequent OpenCLIP checkpoints; checkpoint licenses vary. | Broad compatibility, good baseline and inexpensive small models. General semantics can overrank products sharing category/color while missing SKU differences. | Mature `open_clip` support; many ONNX/Transformers.js-compatible exports. [OpenCLIP](https://github.com/mlfoundations/open_clip). |
| **Marqo FashionSigLIP** | **2024, older**; Apache-2.0. | Fashion-specific option for shoes/clothes. Less appropriate as the only model for arbitrary household/electronic items. | Publisher supplies **ONNX/Transformers.js assets**, including quantized vision weights. Attractive pure-JavaScript baseline. [Publisher’s files](https://huggingface.co/Marqo/marqo-fashionSigLIP/tree/main). |
| **Jina CLIP v2** | **December 2024, older**; **CC-BY-NC-4.0**, with commercial licensing separate. | Multilingual image/text embedding and high-resolution image handling. | ONNX/Transformers.js support is advertised. License is a material distinction from Apache models if this becomes a commercial service. [Official model card](https://huggingface.co/jinaai/jina-clip-v2). |

All local models avoid per-query API charges and Chinese account requirements. Download access and licenses differ; **throughput is hardware/model-dependent**, so there is no meaningful universal searches/second figure.

### Which should handle changed photos best?

My engineering recommendation, **not a demonstrated benchmark result**, is:

1. **Start with Marqo Ecommerce-B/L and SigLIP 2 as competing baselines.**
2. Evaluate **DINOv3-B reranking** on the shortlist, particularly for near-identical colorways or silhouettes.
3. For a JavaScript-first prototype, use **ONNX SigLIP 2 Base or Marqo FashionSigLIP** before attempting a custom Ecommerce-L conversion.

Measure retrieval with **same-SKU positives and difficult near-neighbor negatives**. Broad image classification scores are not adequate evidence for product identity.

Useful ranking practices:

- Compare **several reference angles** with several listing photos.
- Embed both a **product crop and full image**; otherwise watermarks/backgrounds can dominate.
- Combine visual scores with **SKU, colorway and model-name constraints**.
- Deduplicate identical stock photos separately; perceptual hashing helps duplicates but not different-angle product identity.
- Treat cosine similarity as a ranking signal, **not a probability that the item is identical**.
- Reused stock images can produce a perfect photographic match without establishing the physical item’s identity or quality.

### Python/MPS versus Node/ONNX

**Python is the lower-risk first implementation for model evaluation on a Mac.** PyTorch’s MPS backend provides Apple GPU execution, and the Python ecosystem supports the relevant preprocessing and model-specific outputs. CUDA-only acceleration paths do not apply. [Current MPS documentation](https://docs.pytorch.org/docs/main/notes/mps.html).

**Node is viable once the model and export are fixed:**

- Transformers.js uses ONNX; a Hugging Face PyTorch repository does not automatically mean compatible JavaScript inference.
- **Browser WebGPU and Node inference are different execution paths.** Do not assume Node automatically uses MPS because the machine is Apple Silicon.
- ONNX Runtime documents a **CoreML execution provider**, including JavaScript options, but package support, supported operations and actual provider selection must be checked.
- Quantization reduces memory, but evaluate retrieval accuracy after conversion/quantization. [Transformers.js](https://huggingface.co/docs/transformers.js/en/index), [WebGPU guide](https://huggingface.co/docs/transformers.js/guides/webgpu), [CoreML provider](https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html), [JavaScript CoreML options](https://onnxruntime.ai/docs/api/js/interfaces/InferenceSession.CoreMLExecutionProviderOption.html).

## 8. Existing open-source projects

I found **no verified maintained turnkey project combining all five sources, text/image/combined discovery, and local product-level reranking**.

| Project | Reusable material | Boundaries / current evidence |
|---|---|---|
| **[hiobuy/ai-product-finder](https://github.com/hiobuy/ai-product-finder)** | Prompt/image product-search application; concrete API integration architecture. | Requires live HIOBuy credentials and approved channel use. Its upstream access restrictions still apply; not a free marketplace backend. |
| **[Sinpensar/taobao-mcp](https://github.com/Sinpensar/taobao-mcp)** | Playwright login/session handling, keyword results and item extraction. | Small project; manual verification and changing selectors. No demonstrated five-market image search. |
| **[Vladimir-Human/ru-marketplace-mcp](https://github.com/Vladimir-Human/ru-marketplace-mcp)** | Active Chrome-session integration, signed Taobao requests, structured access failures. | Author reports an October 13, 2026 self-check. Text/detail access, not universal reverse search. |
| **[hunterlinhk/taobao-1688-agent-tools](https://github.com/hunterlinhk/taobao-1688-agent-tools)** | Taobao/Tmall detail and 1688 keyword collection patterns; September 2026 activity. | Browser/account dependence; Windows-oriented tooling needs adaptation for Mac. |
| **[Carmenliukang/image_search_products](https://github.com/Carmenliukang/image_search_products)** | 1688 image upload, signing and search sequence. | Older/uncertain maintenance. README implementation scope is narrower than the repository title suggests. |
| **[cachho/jadeship-browser-extension](https://github.com/cachho/jadeship-browser-extension)** | Canonical marketplace/agent URL conversion, embedded product links and QC integrations. | **GPL-3.0**. Useful infrastructure, but a converter is not a search engine. |
| **[1etu/easyupoo](https://github.com/1etu/easyupoo)** | Yupoo album-to-purchase-link/agent workflow. | Small, older project; no global Yupoo index. |
| **[aon082910/shopping-hub](https://github.com/aon082910/shopping-hub)** | Cross-market architecture and documented integration difficulties. | Treat advertised coverage separately from working connectors; undocumented upstreams remain fragile. |

Source availability generally costs nothing; **upstream subscriptions, accounts, licenses and rate limits remain applicable**. README claims alone are insufficient evidence of an operating marketplace backend.

## Recommended stack

The recommendation is deliberately conditional where the research did not establish complete coverage.

| Source | Hobbyist choice | Monthly estimate | Fallback |
|---|---|---:|---|
| **Taobao** | **Elimapi v2** keyword + uploaded-image search; local reranking. | **$10 for 2,000 requests**; larger shared pool as volume grows. Count upload, search, pagination and details separately. | Onebound Pailitao after obtaining a current quote; Apify/Fatkun for supplementary photo searches. |
| **Tmall** | Reuse the Taobao connector **only after confirming Tmall inclusion and identifiable Tmall results**. | **$0 incremental connector fee if included**, consuming the same request pool. Full Tmall coverage remains unverified. | Onebound `item_search_tmall`; OTAPI `is_tmall` if its **$150/month minimum** becomes acceptable. |
| **1688** | **Elimapi v2**, sharing the Taobao billing pool. | Same **$10–$150/month shared pool**, depending on total calls. | TMAPI image API after quote; manual AiPrice/native 1688 search. |
| **Weidian** | **Qualit.ly’s bounded product/QC index**, then local image ranking. Label the coverage explicitly. | **Free at ≤1,000 API calls/month**; **$50/month** above that within Pro limits. | Onebound `micro.item_search` for broader keyword discovery, price by quote; manual Jadeship search. |
| **Yupoo** | Maintain a **selected-store album index** and search/rank locally. | Own collection: no search API fee. Hosted collection example: **$5–$25 for refreshing 2,000–10,000 album records**, excluding image rehosting. | Native per-store image search where enabled; Google domain-targeted text discovery. |

Shared components:

- **Reference images:** Serper for a combined Images/Lens credit pool; **DataForSEO Live** if reference-image retrieval is the only Google operation.
- **Lens:** optional discovery, not the source of promised marketplace coverage.
- **Embeddings:** Python/PyTorch MPS, starting with **Marqo Ecommerce-B and SigLIP 2**, then evaluate DINOv3 reranking.

For budgeting, **600–6,000 item searches/month**, with one Google Images request plus two Serper Lens requests per item, consumes approximately **4,200–42,000 Serper credits**: **$4.20–$42 nominal usage**, subject to the $50/six-month purchase floor. One keyword search, image upload and image search on each of the two Alibaba networks adds approximately **3,600–36,000 marketplace calls/month**, before details and pagination. That suggests roughly **$30–$270/month overall under this illustrative workload**, with substantial variation from caching, uploads, retries and Yupoo refresh size.

**The defensible product promise is broad Taobao/1688 discovery with bounded Weidian/Yupoo coverage—not exhaustive image search across all five sources.**