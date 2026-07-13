/**
 * Confirmed source whitelist — news-sourcing-strategy.md §1 + R1 appendix
 * (server-side curl verification, 2026-07-10) + R6 expansion
 * (server-side curl + ToS check, 2026-07-13, see docs/research/r6-source-expansion.md).
 *
 * RSS/Atom only. No login/paywall bypass, no scraping outside feed summaries
 * (news-sourcing-strategy.md §1 collection principles #1, #2).
 *
 * `country` = ISO 3166-1 alpha-2 edition the feed represents (for Google News,
 * the `gl` edition — not Google's own HQ). `outletKey` groups feeds from the
 * same outlet so the 2-source gate treats them as one source
 * (top10-curation.md §1 Layer 1, rank8 dedup fix).
 */

import type { SourceConfig } from "../types.js";

export const SOURCES: SourceConfig[] = [
  // --- World -----------------------------------------------------------
  {
    outlet: "BBC World",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    category: "world",
    fetchMethod: "rss_summary",
    country: "GB",
    outletKey: "bbc",
  },
  {
    outlet: "The Guardian World",
    url: "https://www.theguardian.com/world/rss",
    category: "world",
    fetchMethod: "rss_summary",
    country: "GB",
    outletKey: "guardian",
  },
  {
    outlet: "Al Jazeera",
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    category: "world",
    fetchMethod: "rss_summary",
    country: "QA",
    outletKey: "aljazeera",
  },
  {
    outlet: "NPR News",
    url: "https://feeds.npr.org/1001/rss.xml",
    category: "world",
    fetchMethod: "rss_summary",
    country: "US",
    outletKey: "npr",
  },
  {
    outlet: "DW (Deutsche Welle)",
    url: "https://rss.dw.com/xml/rss-en-all",
    category: "world",
    fetchMethod: "rss_summary",
    country: "DE",
    outletKey: "dw",
  },
  {
    outlet: "France24 English",
    url: "https://www.france24.com/en/rss",
    category: "world",
    fetchMethod: "rss_summary",
    country: "FR",
    outletKey: "france24",
  },
  {
    outlet: "ABC Australia News",
    url: "https://www.abc.net.au/news/feed/51120/rss.xml",
    category: "world",
    fetchMethod: "rss_summary",
    country: "AU",
    outletKey: "abc-au",
  },

  // --- Korea -------------------------------------------------------------
  {
    outlet: "Korea Herald (All)",
    url: "https://www.koreaherald.com/rss/newsAll",
    category: "korea",
    fetchMethod: "rss_summary",
    country: "KR",
    outletKey: "koreaherald",
  },
  {
    outlet: "Yonhap English",
    url: "https://en.yna.co.kr/RSS/news.xml",
    category: "korea",
    fetchMethod: "rss_summary",
    country: "KR",
    outletKey: "yonhap",
  },

  // --- AI / Tech -----------------------------------------------------------
  {
    outlet: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    category: "ai-tech",
    fetchMethod: "rss_summary",
    country: "US",
    outletKey: "techcrunch",
  },
  {
    outlet: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    category: "ai-tech",
    fetchMethod: "rss_summary",
    country: "US",
    outletKey: "theverge",
  },
  {
    outlet: "Ars Technica",
    url: "https://arstechnica.com/feed/",
    category: "ai-tech",
    fetchMethod: "rss_summary",
    country: "US",
    outletKey: "arstechnica",
  },

  // --- Business ------------------------------------------------------------
  // R6: independent outlets added so the 2-source gate can pass without
  // relying solely on Google News aggregation (top10-curation.md §2).
  {
    outlet: "BBC Business",
    url: "https://feeds.bbci.co.uk/news/business/rss.xml",
    category: "business",
    fetchMethod: "rss_summary",
    country: "GB",
    outletKey: "bbc",
  },
  {
    outlet: "CNBC Top News",
    url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114",
    category: "business",
    fetchMethod: "rss_summary",
    country: "US",
    outletKey: "cnbc",
  },
  {
    outlet: "MarketWatch Top Stories",
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
    category: "business",
    fetchMethod: "rss_summary",
    country: "US",
    outletKey: "marketwatch",
  },
  {
    outlet: "Google News (Business)",
    url: "https://news.google.com/rss/search?q=business&hl=en-US&gl=US&ceid=US:en",
    category: "business",
    fetchMethod: "rss_summary",
    country: "US",
    outletKey: "google-news",
  },
  {
    outlet: "Google News (Business, UK edition)",
    url: "https://news.google.com/rss/search?q=business&hl=en-GB&gl=GB&ceid=GB:en",
    category: "business",
    fetchMethod: "rss_summary",
    country: "GB",
    outletKey: "google-news",
  },
  {
    outlet: "Google News (Global Markets)",
    url: "https://news.google.com/rss/search?q=global%20markets&hl=en-US&gl=US&ceid=US:en",
    category: "business",
    fetchMethod: "rss_summary",
    country: "US",
    outletKey: "google-news",
  },
  {
    outlet: "Google News (Economy)",
    url: "https://news.google.com/rss/search?q=economy&hl=en-US&gl=US&ceid=US:en",
    category: "business",
    fetchMethod: "rss_summary",
    country: "US",
    outletKey: "google-news",
  },

  // --- Culture / Sports ----------------------------------------------------
  {
    outlet: "Korea Herald (Sports)",
    url: "https://www.koreaherald.com/rss/kh_Sports",
    category: "culture-sports",
    fetchMethod: "rss_summary",
    country: "KR",
    outletKey: "koreaherald",
  },
  {
    outlet: "Korea Herald (Life & Culture)",
    url: "https://www.koreaherald.com/rss/kh_LifenCulture",
    category: "culture-sports",
    fetchMethod: "rss_summary",
    country: "KR",
    outletKey: "koreaherald",
  },
  // Independent outlets so culture-sports can pass the 2-source gate
  // (D8 finding 2026-07-13: KH-only feeds share one outletKey).
  // curl-verified 2026-07-13; BBC/Guardian ToS already vetted in R1/R6.
  {
    outlet: "BBC Sport",
    url: "https://feeds.bbci.co.uk/sport/rss.xml",
    category: "culture-sports",
    fetchMethod: "rss_summary",
    country: "GB",
    outletKey: "bbc",
  },
  {
    outlet: "The Guardian Sport",
    url: "https://www.theguardian.com/uk/sport/rss",
    category: "culture-sports",
    fetchMethod: "rss_summary",
    country: "GB",
    outletKey: "guardian",
  },
  {
    outlet: "The Guardian Culture",
    url: "https://www.theguardian.com/uk/culture/rss",
    category: "culture-sports",
    fetchMethod: "rss_summary",
    country: "GB",
    outletKey: "guardian",
  },

  // --- Asia / regional diversification (R6) ---------------------------------
  {
    outlet: "Nikkei Asia",
    url: "https://asia.nikkei.com/rss/feed/nar",
    category: "business",
    fetchMethod: "rss_summary",
    country: "JP",
    outletKey: "nikkei-asia",
  },
  {
    outlet: "The Straits Times (World)",
    url: "https://www.straitstimes.com/news/world/rss.xml",
    category: "world",
    fetchMethod: "rss_summary",
    country: "SG",
    outletKey: "straitstimes",
  },
  {
    outlet: "South China Morning Post",
    url: "https://www.scmp.com/rss/91/feed",
    category: "world",
    fetchMethod: "rss_summary",
    country: "HK",
    outletKey: "scmp",
  },

  // --- Cross-outlet aggregation for corroboration --------------------------
  {
    outlet: "Google News (Korea)",
    url: "https://news.google.com/rss/search?q=Korea&hl=en-US&gl=US&ceid=US:en",
    category: "korea",
    fetchMethod: "rss_summary",
    country: "US",
    outletKey: "google-news",
  },
  {
    outlet: "Google News (Korea, UK edition)",
    url: "https://news.google.com/rss/search?q=Korea&hl=en-GB&gl=GB&ceid=GB:en",
    category: "korea",
    fetchMethod: "rss_summary",
    country: "GB",
    outletKey: "google-news",
  },
  {
    outlet: "Google News (World)",
    url: "https://news.google.com/rss/search?q=world%20news&hl=en-US&gl=US&ceid=US:en",
    category: "world",
    fetchMethod: "rss_summary",
    country: "US",
    outletKey: "google-news",
  },
  {
    outlet: "Google News (World, UK edition)",
    url: "https://news.google.com/rss/search?q=world%20news&hl=en-GB&gl=GB&ceid=GB:en",
    category: "world",
    fetchMethod: "rss_summary",
    country: "GB",
    outletKey: "google-news",
  },
  {
    outlet: "Google News (Asia)",
    url: "https://news.google.com/rss/search?q=Asia&hl=en-GB&gl=GB&ceid=GB:en",
    category: "world",
    fetchMethod: "rss_summary",
    country: "GB",
    outletKey: "google-news",
  },
  {
    outlet: "Google News (Europe)",
    url: "https://news.google.com/rss/search?q=Europe&hl=en-GB&gl=GB&ceid=GB:en",
    category: "world",
    fetchMethod: "rss_summary",
    country: "GB",
    outletKey: "google-news",
  },
  {
    outlet: "Google News (AI)",
    url: "https://news.google.com/rss/search?q=artificial%20intelligence&hl=en-US&gl=US&ceid=US:en",
    category: "ai-tech",
    fetchMethod: "rss_summary",
    country: "US",
    outletKey: "google-news",
  },
  {
    outlet: "Google News (AI, UK edition)",
    url: "https://news.google.com/rss/search?q=artificial%20intelligence&hl=en-GB&gl=GB&ceid=GB:en",
    category: "ai-tech",
    fetchMethod: "rss_summary",
    country: "GB",
    outletKey: "google-news",
  },
];
