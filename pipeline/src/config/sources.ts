/**
 * Confirmed source whitelist — news-sourcing-strategy.md §1 + R1 appendix
 * (server-side curl verification, 2026-07-10).
 *
 * RSS/Atom only. No login/paywall bypass, no scraping outside feed summaries
 * (news-sourcing-strategy.md §1 collection principles #1, #2).
 */

import type { SourceConfig } from "../types.js";

export const SOURCES: SourceConfig[] = [
  // --- World -----------------------------------------------------------
  {
    outlet: "BBC World",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    category: "world",
    fetchMethod: "rss_summary",
  },
  {
    outlet: "The Guardian World",
    url: "https://www.theguardian.com/world/rss",
    category: "world",
    fetchMethod: "rss_summary",
  },
  {
    outlet: "Al Jazeera",
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    category: "world",
    fetchMethod: "rss_summary",
  },
  {
    outlet: "NPR News",
    url: "https://feeds.npr.org/1001/rss.xml",
    category: "world",
    fetchMethod: "rss_summary",
  },

  // --- Korea -------------------------------------------------------------
  {
    outlet: "Korea Herald (All)",
    url: "https://www.koreaherald.com/rss/newsAll",
    category: "korea",
    fetchMethod: "rss_summary",
  },
  {
    outlet: "Yonhap English",
    url: "https://en.yna.co.kr/RSS/news.xml",
    category: "korea",
    fetchMethod: "rss_summary",
  },

  // --- AI / Tech -----------------------------------------------------------
  {
    outlet: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    category: "ai-tech",
    fetchMethod: "rss_summary",
  },
  {
    outlet: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    category: "ai-tech",
    fetchMethod: "rss_summary",
  },
  {
    outlet: "Ars Technica",
    url: "https://arstechnica.com/feed/",
    category: "ai-tech",
    fetchMethod: "rss_summary",
  },

  // --- Business (Google News topic query — multi-outlet aggregation) ------
  {
    outlet: "Google News (Business)",
    url: "https://news.google.com/rss/search?q=business&hl=en-US&gl=US&ceid=US:en",
    category: "business",
    fetchMethod: "rss_summary",
  },

  // --- Culture / Sports ----------------------------------------------------
  {
    outlet: "Korea Herald (Sports)",
    url: "https://www.koreaherald.com/rss/kh_Sports",
    category: "culture-sports",
    fetchMethod: "rss_summary",
  },
  {
    outlet: "Korea Herald (Life & Culture)",
    url: "https://www.koreaherald.com/rss/kh_LifenCulture",
    category: "culture-sports",
    fetchMethod: "rss_summary",
  },

  // --- Cross-outlet aggregation for corroboration --------------------------
  {
    outlet: "Google News (Korea)",
    url: "https://news.google.com/rss/search?q=Korea&hl=en-US&gl=US&ceid=US:en",
    category: "korea",
    fetchMethod: "rss_summary",
  },
  {
    outlet: "Google News (World)",
    url: "https://news.google.com/rss/search?q=world%20news&hl=en-US&gl=US&ceid=US:en",
    category: "world",
    fetchMethod: "rss_summary",
  },
  {
    outlet: "Google News (AI)",
    url: "https://news.google.com/rss/search?q=artificial%20intelligence&hl=en-US&gl=US&ceid=US:en",
    category: "ai-tech",
    fetchMethod: "rss_summary",
  },
];
