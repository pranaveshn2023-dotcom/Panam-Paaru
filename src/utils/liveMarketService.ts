import { AssetType } from '../types';

// 100% In-Memory RAM cache for live NAVs (Zero browser localStorage persistence)
const navCache = new Map<string, { nav: number; date: string; schemeName: string; schemeCode?: number; prevNav?: number; timestamp?: number }>();

// Cache TTL: 10 minutes for real-time NAV data
const CACHE_TTL_MS = 10 * 60 * 1000;

function savePersistentCache(key: string, data: { nav: number; date: string; schemeName: string; schemeCode?: number; prevNav?: number }) {
  navCache.set(key.toLowerCase().trim(), { ...data, timestamp: Date.now() });
}

// Purge any legacy localStorage cache keys from prior builds
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  try {
    localStorage.removeItem('paanam_mf_nav_cache_v1');
    localStorage.removeItem('paanam_mf_nav_cache_v2');
    localStorage.removeItem('paanam_mf_nav_cache_v3');
    localStorage.removeItem('paanam_mf_nav_cache_v4');
  } catch {}
}

/**
 * Robust date parser handling DD-MM-YYYY and DD-MMM-YYYY formats from AMFI / mfapi.in
 */
export function parseNavDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.trim().split(/[-/]/);
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10);
    let m: number;
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const mStr = parts[1].toLowerCase().slice(0, 3);
    if (months[mStr] !== undefined) {
      m = months[mStr];
    } else {
      m = parseInt(parts[1], 10) - 1;
    }
    const y = parseInt(parts[2], 10);
    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
      return new Date(y, m, d);
    }
  }
  const f = new Date(dateStr);
  return isNaN(f.getTime()) ? null : f;
}

/**
 * Strip broker/CAMS/Groww category suffixes (e.g. "- LARGE CAP", "- MID CAP")
 */
export function stripBrokerSuffix(name: string): string {
  if (!name) return '';
  const cleaned = name.replace(/\.{2,}$/, '').trim();
  const dashParts = cleaned.split(/\s+[-–—:]\s+/);
  if (dashParts.length > 1 && dashParts[0].trim().length >= 4) {
    const lastPart = dashParts[dashParts.length - 1].trim();
    const trailingWords = lastPart.split(/\s+/);
    // If trailing segment is an attached broker classification tag (<= 3 words) and not a plan type
    if (trailingWords.length <= 3 && !/\b(growth|direct|regular|idcw|dividend|plan)\b/i.test(lastPart)) {
      return dashParts.slice(0, -1).join(' ').trim();
    }
  }
  return cleaned;
}

/**
 * Clean scheme name for AMFI search query
 */
export function cleanSearchQuery(raw: string): string {
  const stripped = stripBrokerSuffix(raw);
  return stripped
    .replace(/^(name\s+of\s+(the\s+)?scheme|scheme\s*name|scheme)\s*[:：]\s*/i, '')
    .replace(/\bmidcap\b/gi, 'mid cap')
    .replace(/\bsmallcap\b/gi, 'small cap')
    .replace(/\blargecap\b/gi, 'large cap')
    .replace(/\bflexicap\b/gi, 'flexi cap')
    .replace(/\bmulticap\b/gi, 'multi cap')
    .replace(/\b(mutual\s*fund|amc|direct|regular|growth|idcw|payout|reinvestment|plan|option)\b/gi, '')
    .replace(/[\.\(\)₹\$\[\]\/\\-]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Split an asset name into match tokens (lowercase, alnum only, stop words removed)
 */
const MATCH_STOP_WORDS = new Set(['fund', 'scheme', 'plan', 'option', 'growth', 'direct', 'regular', 'idcw', 'dividend', 'amc', 'mutual', 'the', 'of', 'and', 'a', 'an', 'for', 'in', 'with']);

export function normalizeMatchTokens(name: string): string[] {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !MATCH_STOP_WORDS.has(t));
}

/**
 * Dice coefficient similarity between two scheme/fund names
 * (0 = unrelated, 1 = identical token sets)
 */
export function schemeNameSimilarity(a: string, b: string): number {
  const ta = normalizeMatchTokens(a);
  const tb = normalizeMatchTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  let overlap = 0;
  for (const t of ta) {
    if (tb.includes(t)) overlap++;
  }
  for (const t of tb) {
    if (ta.includes(t)) overlap++;
  }
  return (2 * overlap) / (ta.length + tb.length);
}

/**
 * Precision score matching for Indian Mutual Funds:
 * - Defaults to Growth plans (95%+ of investor holdings) unless user explicitly specified IDCW.
 * - Prioritizes Direct plans unless Regular is explicitly specified.
 * - Heavily penalizes category mismatches and extra unexplained words.
 */
function scoreSchemeCandidate(item: { schemeCode: number; schemeName: string }, rawQuery: string): number {
  const stripped = stripBrokerSuffix(rawQuery);
  const qLower = stripped
    .toLowerCase()
    .replace(/\bmid\s+cap\b/g, 'midcap')
    .replace(/\bsmall\s+cap\b/g, 'smallcap')
    .replace(/\blarge\s+cap\b/g, 'largecap')
    .replace(/\bflexi\s+cap\b/g, 'flexicap')
    .replace(/\bblue\s*chip\b/g, 'largecap');

  const sName = item.schemeName || '';
  const sLower = sName
    .toLowerCase()
    .replace(/\bmid\s+cap\b/g, 'midcap')
    .replace(/\bsmall\s+cap\b/g, 'smallcap')
    .replace(/\blarge\s+cap\b/g, 'largecap')
    .replace(/\bflexi\s+cap\b/g, 'flexicap')
    .replace(/\bblue\s*chip\b/g, 'largecap');

  const wantsDirect = /\bdirect\b/i.test(stripped);
  const wantsRegular = /\bregular\b/i.test(stripped);
  const wantsIdcw = /\b(idcw|dividend|payout|reinvestment)\b/i.test(stripped);

  let score = 0;

  // Exact / substring match bonus
  if (sLower === qLower) score += 150;
  else if (sLower.includes(qLower)) score += 60;
  else if (qLower.includes(sLower) && sLower.length >= 8) score += 45;

  // Token matching
  const stopWords = new Set(['fund', 'scheme', 'plan', 'option', 'growth', 'direct', 'regular', 'idcw', 'dividend', 'amc', 'mutual', 'the', 'of', 'and', '&', '-']);
  const qTokens = qLower.split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !stopWords.has(t));
  const sTokens = new Set(sLower.split(/[^a-z0-9]+/).filter((t) => t.length >= 2));

  for (const qt of qTokens) {
    if (sTokens.has(qt)) {
      score += 20;
    } else {
      for (const st of sTokens) {
        if (st.includes(qt) || qt.includes(st)) {
          score += 10;
          break;
        }
      }
    }
  }

  // Penalize distinct category keywords absent from the query
  const categoryKeywords = [
    'next', 'smallcap', 'midcap', 'largecap', 'flexicap', 'multicap', 'focused', 'elss',
    'hybrid', 'arbitrage', 'liquid', 'overnight', 'gilt', 'debt', 'index',
    'us', 'global', 'overseas', 'international', 'gold', 'silver', 'esg',
    'contra', 'pharma', 'tech', 'digital', 'infrastructure', 'banking',
    'etf', 'nifty', 'sensex',
  ];
  for (const cat of categoryKeywords) {
    if (sTokens.has(cat) && !qTokens.some((qt) => qt.includes(cat) || cat.includes(qt))) {
      score -= 40;
    }
  }

  // Heavy diverging category penalties (e.g. FoF / Asset Allocation / Conservative when user asked for Midcap)
  if (!qTokens.some((t) => /asset|allocation|conservative|fof|fund of fund/i.test(t))) {
    if (/asset\s*allocation|conservative|fund\s*of\s*fund|\bfof\b/i.test(sName)) {
      score -= 80;
    }
  }

  // Penalize every unexplained extra word in the candidate name so exact-name schemes win ties
  const matched = new Set<string>();
  for (const qt of qTokens) {
    for (const st of sTokens) {
      if (st.includes(qt) || qt.includes(st)) matched.add(st);
    }
  }
  for (const st of sTokens) {
    if (!matched.has(st)) score -= 15;
  }

  // Penalize every query token that could not be matched at all
  for (const qt of qTokens) {
    let found = false;
    for (const st of sTokens) {
      if (st.includes(qt) || qt.includes(st)) { found = true; break; }
    }
    if (!found) score -= 12;
  }

  // Direct vs Regular preference
  const isDirect = sName.toLowerCase().includes('direct');
  const isRegular = sName.toLowerCase().includes('regular');
  if (wantsDirect) {
    if (isDirect) score += 30;
    if (isRegular) score -= 30;
  } else if (wantsRegular) {
    if (isRegular) score += 30;
    if (isDirect) score -= 30;
  } else {
    if (isDirect) score += 15;
  }

  // Growth vs IDCW preference (Default is ALWAYS Growth!)
  const isIdcw = /\b(idcw|dividend|payout|reinvestment)\b/i.test(sName);
  const isGrowth = /\bgrowth\b/i.test(sName);
  if (wantsIdcw) {
    if (isIdcw) score += 40;
    if (isGrowth) score -= 20;
  } else {
    if (isGrowth) score += 40;
    if (isIdcw) score -= 60;
  }

  if (/institutional|unclaimed|segregated|bonus/i.test(sName)) score -= 50;

  return score;
}

/**
 * Fetch official AMFI live NAV dynamically for any Indian Mutual Fund.
 * Uses real-time feeds from api.mfapi.in with multi-tier search and Growth-default resolution.
 *
 * @param fundName  - Scheme/fund name (as stored in the holding).
 * @param notes     - Optional notes string from the holding (may contain "ISIN: INF…" written
 *                    by the parser). When present the ISIN is used as the primary lookup key —
 *                    the most accurate path, matching what the Convex backend already does.
 */
export async function fetchAmfiNav(
  fundName: string,
  notes?: string
): Promise<{ nav: number; date: string; schemeName: string; schemeCode?: number; prevNav?: number } | null> {
  const normKey = fundName.toLowerCase().trim();

  // 1. Check in-memory cache (valid for 10 minutes)
  const cached = navCache.get(normKey);
  if (cached && (!cached.timestamp || Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached;
  }

  // If offline, immediately return in-memory cache if available without attempting network calls
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return cached || null;
  }

  try {
    const combined = `${fundName} ${notes || ''}`;

    // 1. ISIN-based lookup — highest-accuracy and 100% unique per scheme variant.
    const isinMatch = combined.match(/\b(INF[A-Z0-9]{9})\b/i);
    if (isinMatch) {
      try {
        const isin = isinMatch[1].toUpperCase();
        const masterRes = await fetch('https://api.mfapi.in/mf', { signal: AbortSignal.timeout(5000) });
        if (masterRes.ok) {
          const masterList: { schemeCode: number; schemeName: string; isinGrowth?: string; isinDivReinvestment?: string }[] =
            await masterRes.json();
          const found = masterList.find(
            (x) => x.isinGrowth === isin || x.isinDivReinvestment === isin
          );
          if (found && found.schemeCode) {
            const detailRes = await fetch(`https://api.mfapi.in/mf/${found.schemeCode}`, {
              signal: AbortSignal.timeout(4500),
            });
            if (detailRes.ok) {
              const details = await detailRes.json();
              const latest = details?.data?.[0];
              const prev = details?.data?.[1];
              if (latest && latest.nav) {
                const navNum = parseFloat(latest.nav);
                if (!isNaN(navNum) && navNum > 0) {
                  const res = {
                    nav: navNum,
                    date: latest.date || '',
                    schemeName: details.meta?.scheme_name || found.schemeName || fundName,
                    schemeCode: found.schemeCode,
                    prevNav: prev?.nav ? parseFloat(prev.nav) : undefined,
                  };
                  navCache.set(normKey, res);
                  savePersistentCache(normKey, res);
                  return res;
                }
              }
            }
          }
        }
      } catch {}
    }

    // 2. Direct scheme code check (Explicitly stripping out any Folio numbers!)
    // ⚠️ Guard: A folio number is an investor's personal account number and is NOT unique to a fund.
    const withoutFolio = combined.replace(/\b(?:folio|folio\s*no|folio\s*number|ac\s*no|account|acc)\s*[:#-]?\s*[\w\/-]+/gi, '');
    const explicitSchemeMatch = withoutFolio.match(/\b(?:scheme\s*code|amfi\s*code|amfi|code)\s*[:#-]?\s*(\d{6})\b/i) || withoutFolio.match(/\b\d{6}\b/);
    if (explicitSchemeMatch) {
      const code = explicitSchemeMatch[1] || explicitSchemeMatch[0];
      const detailRes = await fetch(`https://api.mfapi.in/mf/${code}`, { signal: AbortSignal.timeout(4500) });
      if (detailRes.ok) {
        const details = await detailRes.json();
        const latest = details?.data?.[0];
        const prev = details?.data?.[1];
        if (latest && latest.nav) {
          const navNum = parseFloat(latest.nav);
          const resolvedName = String(details.meta?.scheme_name || '');
          const sim = resolvedName ? schemeNameSimilarity(fundName, resolvedName) : 0;
          if (!isNaN(navNum) && navNum > 0 && sim >= 0.45) {
            const res = {
              nav: navNum,
              date: latest.date || '',
              schemeName: details.meta?.scheme_name || fundName,
              schemeCode: parseInt(code, 10),
              prevNav: prev?.nav ? parseFloat(prev.nav) : undefined,
            };
            navCache.set(normKey, res);
            savePersistentCache(normKey, res);
            return res;
          }
        }
      }
    }

    // 4. Multi-tier query builder
    const clean = cleanSearchQuery(fundName);
    const coreWords = clean.split(/\s+/).filter(Boolean);
    if (coreWords.length === 0) return null;

    const baseQuery = coreWords.join(' ');
    const compoundJoined = baseQuery
      .replace(/\bmid\s+cap\b/gi, 'Midcap')
      .replace(/\bsmall\s+cap\b/gi, 'Smallcap')
      .replace(/\blarge\s+cap\b/gi, 'Largecap')
      .replace(/\bflexi\s+cap\b/gi, 'Flexicap');
    const compoundSpaced = baseQuery
      .replace(/\bmidcap\b/gi, 'Mid Cap')
      .replace(/\bsmallcap\b/gi, 'Small Cap')
      .replace(/\blargecap\b/gi, 'Large Cap')
      .replace(/\bflexicap\b/gi, 'Flexi Cap');
    const largeCapAlt = baseQuery.replace(/\bblue\s*chip\b/gi, 'Large Cap');

    const queries: string[] = [
      baseQuery,
      compoundJoined,
      compoundSpaced,
      largeCapAlt !== baseQuery ? largeCapAlt : null,
      coreWords.slice(0, 4).join(' '),
      coreWords.slice(0, 3).join(' '),
      coreWords.slice(0, 2).join(' '),
    ].filter((q): q is string => Boolean(q) && q.length >= 3);

    const uniqueQueries = [...new Set(queries)];
    const candidateMap = new Map<number, { schemeCode: number; schemeName: string; score: number }>();

    for (const q of uniqueQueries) {
      try {
        const searchRes = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`, {
          signal: AbortSignal.timeout(3500),
        });
        if (searchRes.ok) {
          const list: { schemeCode: number; schemeName: string }[] = await searchRes.json();
          if (Array.isArray(list)) {
            for (const item of list) {
              if (!candidateMap.has(item.schemeCode)) {
                const score = scoreSchemeCandidate(item, fundName);
                candidateMap.set(item.schemeCode, { ...item, score });
              }
            }
          }
        }
      } catch {}
      const strongCandidates = [...candidateMap.values()].filter((c) => c.score >= 70).length;
      if (strongCandidates >= 3) break;
    }

    const sortedCandidates = Array.from(candidateMap.values()).sort((a, b) => b.score - a.score);
    if (sortedCandidates.length === 0) return null;

    // 5. Inspect top candidates to find the active plan with the most recent NAV
    const topCandidates = sortedCandidates.slice(0, 6);
    const now = Date.now();
    const validResults: {
      nav: number;
      date: string;
      schemeName: string;
      schemeCode: number;
      prevNav?: number;
      score: number;
      isDirect: boolean;
    }[] = [];

    for (const cand of topCandidates) {
      try {
        const detailRes = await fetch(`https://api.mfapi.in/mf/${cand.schemeCode}/latest`, {
          signal: AbortSignal.timeout(4000),
        });
        if (!detailRes.ok) continue;

        const details = await detailRes.json();
        const latest = details?.data?.[0];
        if (!latest || !latest.nav) continue;

        const navNum = parseFloat(latest.nav);
        if (isNaN(navNum) || navNum <= 0) continue;

        // Date validation: reject only truly dead schemes (> 60 days inactive)
        const navDate = parseNavDate(latest.date);
        if (navDate && now - navDate.getTime() > 60 * 24 * 60 * 60 * 1000) {
          continue; // Discontinued scheme, skip to next candidate
        }

        // Skip candidates whose resolved name diverges sharply from the searched fund
        const resolvedName = String(details.meta?.scheme_name || cand.schemeName || '');
        if (resolvedName && schemeNameSimilarity(fundName, resolvedName) < 0.25) {
          continue;
        }

        validResults.push({
          nav: navNum,
          date: latest.date || '',
          schemeName: resolvedName,
          schemeCode: cand.schemeCode,
          prevNav: details.data?.[1]?.nav ? parseFloat(details.data[1].nav) : undefined,
          score: cand.score,
          isDirect: /direct/i.test(resolvedName) || /direct/i.test(cand.schemeName),
        });
      } catch {}
    }

    if (validResults.length === 0) return null;

    validResults.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.isDirect && !b.isDirect) return -1;
      if (!a.isDirect && b.isDirect) return 1;
      if (b.nav !== a.nav) return b.nav - a.nav;
      return (a.schemeCode || 0) - (b.schemeCode || 0);
    });

    const result = {
      nav: validResults[0].nav,
      date: validResults[0].date,
      schemeName: validResults[0].schemeName,
      schemeCode: validResults[0].schemeCode,
      prevNav: validResults[0].prevNav,
    };
    navCache.set(normKey, result);
    savePersistentCache(normKey, result);
    return result;
  } catch (err) {
    console.warn(`[LiveNAV] Failed to fetch live NAV for: ${fundName}`, err);
    return null;
  }
}

/**
 * Fetch a Yahoo Finance chart JSON — direct first (Yahoo serves CORS headers on
 * /v8/finance/chart), falling back to the corsproxy.io mirror when the direct
 * call is blocked or rate-limited. Avoids single-point-of-failure on the proxy.
 */
async function fetchYahooChart(symbol: string): Promise<any | null> {
  const directUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
  try {
    const res = await fetch(directUrl, { signal: AbortSignal.timeout(4000) });
    if (res.ok) return await res.json();
  } catch {}
  try {
    const proxiedUrl = `https://corsproxy.io/?url=${encodeURIComponent(directUrl)}`;
    const res = await fetch(proxiedUrl, { signal: AbortSignal.timeout(4000) });
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

/**
 * Fetch Yahoo Finance search results — direct first, corsproxy.io fallback.
 */
async function fetchYahooSearch(query: string, quotesCount = 5): Promise<any[] | null> {
  const directUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=${quotesCount}`;
  try {
    const res = await fetch(directUrl, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data: any = await res.json();
      return data?.quotes || null;
    }
  } catch {}
  try {
    const proxiedUrl = `https://corsproxy.io/?url=${encodeURIComponent(directUrl)}`;
    const res = await fetch(proxiedUrl, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data: any = await res.json();
      return data?.quotes || null;
    }
  } catch {}
  return null;
}

function parseYahooQuoteMeta(meta: any): { price: number; prevClose?: number } | null {
  if (!meta || typeof meta.regularMarketPrice !== 'number' || meta.regularMarketPrice <= 0) return null;
  const change =
    typeof meta.fulldayChange === 'number'
      ? meta.fulldayChange
      : typeof meta.regularMarketChange === 'number'
      ? meta.regularMarketChange
      : undefined;
  const prevClose = change !== undefined ? meta.regularMarketPrice - change : meta.previousClose || meta.chartPreviousClose;
  return { price: meta.regularMarketPrice, prevClose: typeof prevClose === 'number' ? prevClose : undefined };
}

export function isIndianStockMarketOpen(): { isOpen: boolean; isNightNavWindow: boolean; reason: string } {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const istDate = new Date(utcMs + 5.5 * 60 * 60 * 1000);

  const dayOfWeek = istDate.getDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const m = String(istDate.getMonth() + 1).padStart(2, '0');
  const d = String(istDate.getDate()).padStart(2, '0');
  const monthDay = `${m}-${d}`;

  const INDIAN_MARKET_HOLIDAYS = new Set([
    '01-26', '03-08', '03-25', '03-29', '04-11', '04-14', '04-17',
    '05-01', '06-17', '07-17', '08-15', '10-02', '10-12', '10-31',
    '11-01', '11-15', '12-25'
  ]);

  const isHoliday = INDIAN_MARKET_HOLIDAYS.has(monthDay);
  const currentMinutes = istDate.getHours() * 60 + istDate.getMinutes();
  const isTradingSession = currentMinutes >= 555 && currentMinutes <= 930; // 09:15 to 15:30 IST
  const isNightNavWindow = !isWeekend && !isHoliday && currentMinutes >= 1260; // 09:00 PM to 12:00 AM IST

  const isOpen = !isWeekend && !isHoliday && isTradingSession;
  let reason = 'Market Open';
  if (isWeekend) {
    reason = dayOfWeek === 6 ? 'Market Closed (Saturday)' : 'Market Closed (Sunday)';
  } else if (isHoliday) {
    reason = 'Market Closed (NSE/BSE Public Holiday)';
  } else if (isNightNavWindow) {
    reason = 'Market Closed (AMC Nightly NAV Release Window)';
  } else if (currentMinutes < 555) {
    reason = 'Market Closed (Pre-Market / Opens 9:15 AM IST)';
  } else if (currentMinutes > 930) {
    reason = 'Market Closed (Closes 3:30 PM IST)';
  }

  return { isOpen, isNightNavWindow, reason };
}

export function getLatestMarketCloseTimeMs(customNow?: Date): number {
  const now = customNow || new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const istDate = new Date(utcMs + 5.5 * 60 * 60 * 1000);

  const hours = istDate.getHours();
  const minutes = istDate.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  const target = new Date(istDate);
  if (currentMinutes < 930) {
    target.setDate(target.getDate() - 1);
  }

  const INDIAN_MARKET_HOLIDAYS = new Set([
    '01-26', '03-08', '03-25', '03-29', '04-11', '04-14', '04-17',
    '05-01', '06-17', '07-17', '08-15', '10-02', '10-12', '10-31',
    '11-01', '11-15', '12-25'
  ]);

  for (let i = 0; i < 14; i++) {
    const day = target.getDay();
    const m = String(target.getMonth() + 1).padStart(2, '0');
    const d = String(target.getDate()).padStart(2, '0');
    const monthDay = `${m}-${d}`;
    const isWeekend = day === 0 || day === 6;
    const isHoliday = INDIAN_MARKET_HOLIDAYS.has(monthDay);
    if (!isWeekend && !isHoliday) {
      return Date.UTC(target.getFullYear(), target.getMonth(), target.getDate(), 10, 0, 0);
    }
    target.setDate(target.getDate() - 1);
  }
  return 0;
}

interface ClientStockCacheEntry {
  price: number;
  prevClose?: number;
  symbol?: string;
  timestamp: number;
}

const clientStockPriceCache = new Map<string, ClientStockCacheEntry>();

/**
 * Fetch live stock/ETF/commodity quote dynamically with ZERO hardcoding.
 * Respects Indian market hours (35s TTL during trading; frozen closing price during non-market/weekend/holiday).
 */
export async function fetchLiveStockPrice(
  nameOrSymbol: string,
  notes?: string,
  knownIsin?: string
): Promise<{ price: number; prevClose?: number; symbol?: string; isin?: string } | null> {
  const combined = `${nameOrSymbol} ${notes || ''}`;
  const isinMatch = knownIsin || combined.match(/\b(INE[A-Z0-9]{9})\b/i)?.[1]?.toUpperCase() || combined.match(/\b(IN[A-Z0-9]{10})\b/i)?.[1]?.toUpperCase();
  const clean = nameOrSymbol.trim().toUpperCase();
  const cacheKey = isinMatch || clean;
  const market = isIndianStockMarketOpen();
  const cached = clientStockPriceCache.get(cacheKey) || clientStockPriceCache.get(clean);
  const now = Date.now();
  const latestCloseTime = getLatestMarketCloseTimeMs();

  // 1. Closed market: Prices do not change on weekends, holidays, or after-hours
  // Cache valid only if recorded after latest trading session close (15:30 IST)
  if (!market.isOpen && cached && cached.price > 0 && cached.timestamp >= latestCloseTime) {
    return { price: cached.price, prevClose: cached.prevClose, symbol: cached.symbol, isin: isinMatch };
  }

  // 2. Open market: Cache valid for 35 seconds to maintain accuracy and prevent API rate limits
  if (market.isOpen && cached && cached.price > 0 && now - cached.timestamp < 35000) {
    return { price: cached.price, prevClose: cached.prevClose, symbol: cached.symbol, isin: isinMatch };
  }

  const candidates: string[] = [];

  // Address stock based on unique ISIN: dynamically resolve to Ticker.NS or Ticker.BO via Yahoo Finance search
  if (isinMatch) {
    const isinQuotes = await fetchYahooSearch(isinMatch);
    if (isinQuotes && isinQuotes.length > 0) {
      const nse = isinQuotes.find((q) => q.symbol && q.symbol.toUpperCase().endsWith('.NS'));
      if (nse?.symbol) candidates.push(nse.symbol.toUpperCase());
      const bse = isinQuotes.find((q) => q.symbol && q.symbol.toUpperCase().endsWith('.BO'));
      if (bse?.symbol) {
        const nseFromBse = bse.symbol.toUpperCase().replace(/\.BO$/, '.NS');
        if (!candidates.includes(nseFromBse)) candidates.push(nseFromBse);
        if (!candidates.includes(bse.symbol.toUpperCase())) candidates.push(bse.symbol.toUpperCase());
      }
      if (candidates.length === 0 && isinQuotes[0]?.symbol) {
        candidates.push(isinQuotes[0].symbol.toUpperCase());
      }
    }
  }

  const strippedCorporate = clean
    .replace(/\b(LIMITED|LTD|CORPORATION|CORP|COMPANY|CO|PLC|PVT|PRIVATE)\b\.?/gi, '')
    .trim();

  const hasSuffix = clean.endsWith('.NS') || clean.endsWith('.BO') || clean.endsWith('-INR') || clean.endsWith('-USD');
  if (hasSuffix) {
    if (!candidates.includes(clean)) candidates.push(clean);
  } else {
    // Direct NSE/BSE attempts for bare tickers (e.g. 'RELIANCE', 'INFY', 'NIFTYBEES')
    if (/^[A-Z0-9]{1,14}$/.test(clean)) {
      if (!candidates.includes(`${clean}.NS`)) candidates.push(`${clean}.NS`);
      if (!candidates.includes(`${clean}.BO`)) candidates.push(`${clean}.BO`);
    }
    const compact = strippedCorporate.replace(/[^A-Z0-9]/g, '');
    if (compact.length >= 2 && compact.length <= 14) {
      if (!candidates.includes(`${compact}.NS`)) candidates.push(`${compact}.NS`);
      if (!candidates.includes(`${compact}.BO`)) candidates.push(`${compact}.BO`);
    }
  }

  // Extract individual alphanumeric tokens (e.g. from 'AXISAMC-GOLDAXIS' -> 'AXISAMC', 'GOLDAXIS')
  const tokens = clean.split(/[^A-Z0-9]+/).filter((t) => t.length >= 2 && t.length <= 14);
  for (const t of tokens) {
    if (t.length >= 4 && /^[A-Z0-9]+$/.test(t)) {
      if (!candidates.includes(`${t}.NS`)) candidates.push(`${t}.NS`);
      if (!candidates.includes(`${t}.BO`)) candidates.push(`${t}.BO`);
    }
  }

  // Dynamic Yahoo search for unhandled symbols if no candidates
  if (candidates.length === 0) {
    const searchQueries = [clean];
    if (strippedCorporate && strippedCorporate !== clean && strippedCorporate.length >= 3) {
      searchQueries.push(strippedCorporate);
    }
    if (tokens.length > 1) {
      searchQueries.push(tokens.join(' '));
      for (const t of tokens) {
        if (t.length >= 4 && !searchQueries.includes(t)) {
          searchQueries.push(t);
        }
      }
    }

    for (const sq of searchQueries) {
      const quotes = await fetchYahooSearch(sq);
      if (quotes) {
        for (const q of quotes) {
          if (q.symbol && !candidates.includes(q.symbol)) {
            candidates.push(q.symbol);
          }
        }
      }
    }
  }

  // Strict priority: Indian NSE (.NS) MUST be first, then BSE (.BO), then any other INR
  candidates.sort((a, b) => {
    const aNse = a.endsWith('.NS');
    const bNse = b.endsWith('.NS');
    if (aNse && !bNse) return -1;
    if (!aNse && bNse) return 1;

    const aBse = a.endsWith('.BO');
    const bBse = b.endsWith('.BO');
    if (aBse && !bBse) return -1;
    if (!aBse && bBse) return 1;

    return 0;
  });

  for (const sym of candidates) {
    const data = await fetchYahooChart(sym);
    const meta = data?.chart?.result?.[0]?.meta;
    const parsed = meta ? parseYahooQuoteMeta(meta) : null;
    if (parsed && parsed.price > 0) {
      const result = { price: parsed.price, prevClose: parsed.prevClose, symbol: sym, isin: isinMatch };
      clientStockPriceCache.set(cacheKey, { ...result, timestamp: Date.now() });
      if (cacheKey !== clean) {
        clientStockPriceCache.set(clean, { ...result, timestamp: Date.now() });
      }
      return result;
    }
  }

  // Fallback to cached value if network failed
  if (cached && cached.price > 0) {
    return { price: cached.price, prevClose: cached.prevClose, symbol: cached.symbol, isin: isinMatch };
  }

  return null;
}

let clientLastKnownLiveUsdInrRate: number | null = null;

export async function fetchLiveUsdInrRate(): Promise<number> {
  // 1. Primary: Yahoo Finance live forex spot USDINR=X
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/USDINR=X', {
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data: any = await res.json();
      const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (typeof rate === 'number' && rate > 0) {
        clientLastKnownLiveUsdInrRate = rate;
        return rate;
      }
    }
  } catch {}

  // 2. Secondary: Open Exchange Rates public live feed
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data: any = await res.json();
      const rate = data?.rates?.INR;
      if (typeof rate === 'number' && rate > 0) {
        clientLastKnownLiveUsdInrRate = rate;
        return rate;
      }
    }
  } catch {}

  // 3. Tertiary: Frankfurter European Central Bank live reference exchange rate
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=INR', {
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data: any = await res.json();
      const rate = data?.rates?.INR;
      if (typeof rate === 'number' && rate > 0) {
        clientLastKnownLiveUsdInrRate = rate;
        return rate;
      }
    }
  } catch {}

  // 4. In-memory session cache: uses last verified live rate fetched from market
  if (clientLastKnownLiveUsdInrRate !== null && clientLastKnownLiveUsdInrRate > 0) {
    return clientLastKnownLiveUsdInrRate;
  }

  // 5. Offline initial fallback
  return 88.5;
}

/**
 * Dedicated crypto price fetcher using live Indian exchange tickers (CoinDCX / WazirX)
 * with CoinGecko (INR) + Yahoo Finance fallbacks.
 * Matches the exact domestic spot rates seen on Indian apps like CoinSwitch, CoinDCX, and WazirX.
 * Zero API keys required, 100% free and open live feed.
 */
export async function fetchLiveCryptoPrice(
  nameOrSymbol: string
): Promise<{ price: number; prevClose?: number; symbol?: string } | null> {
  const COMMON_CRYPTO_TYPOS: Record<string, string> = {
    etherimem: 'ethereum',
    etherium: 'ethereum',
    ethreum: 'ethereum',
    etherum: 'ethereum',
    bitcion: 'bitcoin',
    btcoin: 'bitcoin',
    bitoin: 'bitcoin',
    solanna: 'solana',
    solna: 'solana',
    cardanno: 'cardano',
    dogcoin: 'dogecoin',
    riple: 'ripple',
    theter: 'tether',
    poligon: 'polygon',
    shiba: 'shiba-inu',
  };

  let clean = nameOrSymbol.trim().toLowerCase()
    .replace(/\s*(coin|token|crypto|currency|inr|usd|usdt)\s*/gi, '')
    .trim();

  if (COMMON_CRYPTO_TYPOS[clean]) {
    clean = COMMON_CRYPTO_TYPOS[clean];
  }

  if (!clean || clean.length < 2) return null;

  let coinId: string | null = null;
  let targetSymbol = clean.toUpperCase();

  // 1. Resolve coin ID and symbol dynamically via CoinGecko search
  try {
    const searchUrl = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(clean)}`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(4000) });
    if (searchRes.ok) {
      const searchData: any = await searchRes.json();
      const coins = searchData?.coins;
      if (coins && coins.length > 0) {
        const upperClean = clean.toUpperCase();
        const exact = coins.find((c: any) =>
          c.symbol?.toUpperCase() === upperClean ||
          c.name?.toLowerCase() === clean
        );
        const chosen = exact || coins[0];
        coinId = chosen?.id || null;
        if (chosen?.symbol) targetSymbol = chosen.symbol.toUpperCase();
      }
    }
  } catch {}

  // 2. Primary: Real-time Indian Crypto Exchange (CoinDCX public live ticker)
  // Exactly matches the domestic INR spot price seen on Indian apps like CoinSwitch (e.g. ~76.71L)
  if (targetSymbol) {
    try {
      const dcxRes = await fetch('https://api.coindcx.com/exchange/ticker', {
        signal: AbortSignal.timeout(4000),
      });
      if (dcxRes.ok) {
        const list: any[] = await dcxRes.json();
        const match = list.find((t: any) => t.market === `${targetSymbol}INR`);
        if (match && typeof match.last_price === 'string' && parseFloat(match.last_price) > 0) {
          const price = parseFloat(match.last_price);
          const changePct = parseFloat(match.change_24_hour || '0');
          const prevClose = changePct !== 0 ? price / (1 + changePct / 100) : undefined;
          return { price, prevClose, symbol: match.market };
        }
      }
    } catch {}

    // 3. Secondary: TradingView Scanner API (Global Benchmark: BINANCE:BTCUSDT / BYBIT:BTCUSDT)
    try {
      const tvRes = await fetch('https://scanner.tradingview.com/crypto/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: {
            tickers: [
              `BINANCE:${targetSymbol}USDT`,
              `BYBIT:${targetSymbol}USDT`,
              `COINBASE:${targetSymbol}USD`,
            ],
          },
          columns: ['close', 'change', 'description'],
        }),
        signal: AbortSignal.timeout(4000),
      });
      if (tvRes.ok) {
        const tvData: any = await tvRes.json();
        const rows: any[] = tvData?.data || [];
        const best = rows.find(
          (r) => r.d && typeof r.d[0] === 'number' && r.d[0] > 0
        );
        if (best) {
          const usdPrice = best.d[0];
          const changePct = best.d[1] || 0;
          const usdInr = await fetchLiveUsdInrRate();
          const inrPrice = Math.round(usdPrice * usdInr * 100) / 100;
          const prevClose = changePct !== 0 ? inrPrice / (1 + changePct / 100) : undefined;
          return { price: inrPrice, prevClose, symbol: best.s };
        }
      }
    } catch {}

    // 3. Secondary Indian exchange ticker (WazirX public ticker)
    try {
      const wzRes = await fetch('https://api.wazirx.com/sapi/v1/tickers/24hr', {
        signal: AbortSignal.timeout(4000),
      });
      if (wzRes.ok) {
        const list: any[] = await wzRes.json();
        const lowerSym = targetSymbol.toLowerCase();
        const match = list.find((t: any) => t.symbol === `${lowerSym}inr`);
        if (match && typeof match.lastPrice === 'string' && parseFloat(match.lastPrice) > 0) {
          const price = parseFloat(match.lastPrice);
          return { price, symbol: match.symbol.toUpperCase() };
        }
      }
    } catch {}
  }

  // 4. Global Spot Fallback: CoinGecko INR conversion
  if (coinId) {
    try {
      const priceRes = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=inr&include_24hr_change=true`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (priceRes.ok) {
        const priceData: any = await priceRes.json();
        const coinData = priceData?.[coinId];
        if (coinData && typeof coinData.inr === 'number' && coinData.inr > 0) {
          const price = coinData.inr;
          const changePct = coinData.inr_24h_change || 0;
          const prevClose = changePct !== 0 ? price / (1 + changePct / 100) : undefined;
          return { price, prevClose, symbol: coinId.toUpperCase() };
        }
      }
    } catch {}
  }

  // 5. Fallback: Yahoo Finance with BTC-INR style symbols
  const upper = nameOrSymbol.trim().toUpperCase().replace(/\s*(COIN|TOKEN|CRYPTO|CURRENCY)\s*/gi, '').trim();
  const tokens = upper.split(/[^A-Z0-9]+/).filter((t) => t.length >= 2 && t.length <= 10);
  const candidates: string[] = [];
  if (targetSymbol) {
    candidates.push(`${targetSymbol}-INR`);
    candidates.push(`${targetSymbol}-USD`);
  }
  for (const t of tokens) {
    if (t === 'INR' || t === 'USD' || t === 'USDT') continue;
    if (!candidates.includes(`${t}-INR`)) candidates.push(`${t}-INR`);
    if (!candidates.includes(`${t}-USD`)) candidates.push(`${t}-USD`);
  }

  for (const sym of candidates) {
    const data = await fetchYahooChart(sym);
    const meta = data?.chart?.result?.[0]?.meta;
    const parsed = meta ? parseYahooQuoteMeta(meta) : null;
    if (parsed && parsed.price > 0) {
      let price = parsed.price;
      if (sym.endsWith('-USD')) {
        const usdInr = await fetchLiveUsdInrRate();
        price = price * usdInr;
      }
      return { price, prevClose: parsed.prevClose, symbol: sym };
    }
  }

  return null;
}

/**
 * Dynamic sector detector without hardcoded company or sector dictionaries.
 * Reads actual sector strictly if present in the document. If absent, returns empty.
 */
export function detectStockSector(_nameOrSymbol: string, explicitSector?: string): string {
  if (explicitSector && explicitSector.trim()) {
    return explicitSector.trim();
  }
  return '';
}

/**
 * Granular Asset Class Classifier.
 * If the user's Excel / DOCX / CSV file has an explicit TYPE / CATEGORY column,
 * it adopts the REAL original type directly from the file!
 */
export function detectDetailedAssetType(
  name: string,
  explicitType?: string,
  explicitSector?: string
): {
  assetType: AssetType;
  subType: string;
  sector?: string;
} {
  const normType = (explicitType || '').trim();
  const lowerType = normType.toLowerCase();
  const lowerName = name.toLowerCase();

  // Check if name clearly represents a Mutual Fund (AMC, Fund, Scheme, Direct, Regular, Growth, etc.)
  const isFundName =
    /\bfund\b|\bamc\b|\bmutual\b|\bgrowth\b|\bindex\b|\bdirect\b|\bregular\b|\belss\b|\barbitrage\b|\bliquid\b|\bovernight\b|\bbalanced\b|\bbluechip\b|\bflexi\b|\bsmall\s*cap\b|\bmid\s*cap\b|\blarge\s*cap\b|\bmulti\s*cap\b|\bcontra\b|\bthematic\b|\bsectoral\b|\bopportunities\b|\bemerging\b|\binternational\b|\boverseas\b/i.test(
      lowerName
    );

  // Dynamic Universal Commodity (Gold, Silver, DigiGold, SGB, Bullion) detector from name or ticker symbols
  // Uses generic commodity matching without hardcoded commercial brand names
  const isGoldSymbolOrName =
    /(?:gold(?!man)|silver|silve|sgb|sovereign.*gold|bullion|digi(?:tal)?\s*(?:gold|silver|metal)|precious\s*metal)/i.test(
      lowerName
    ) ||
    /gold|silver|sgb|precious|commodity|commodities|bullion|digi.*gold|digital.*gold/i.test(lowerType);

  if (isGoldSymbolOrName) {
    const isSilver = /silver|silve/i.test(lowerName) || /silver/i.test(lowerType);
    const isSgb = /sgb|sovereign/i.test(lowerName) || /sgb|sovereign/i.test(lowerType);
    const isDigiGold =
      /digi(?:tal)?\s*(?:gold|silver|metal)/i.test(lowerName) ||
      /digi|digital/i.test(lowerType);
    const isFund = /fund|fof|mutual\s*fund|\bamc\b/i.test(lowerName);

    let detectedSubType = 'Gold ETF';
    if (isSgb) {
      detectedSubType = 'Sovereign Gold Bond (SGB)';
    } else if (isDigiGold) {
      detectedSubType = isSilver ? 'Digital Silver' : 'Digital Gold';
    } else if (isSilver) {
      detectedSubType = isFund ? 'Silver Fund' : 'Silver ETF';
    } else if (isFund) {
      detectedSubType = 'Gold Fund';
    }

    const finalSubType =
      normType && !/^(other|others|asset|equity|mutual\s*fund)$/i.test(normType)
        ? normType
        : detectedSubType;

    return {
      assetType: 'gold',
      subType: finalSubType,
      sector: explicitSector || 'Commodities',
    };
  }

  // 1. If document provided an explicit type column, honor the document's real value!
  if (normType) {
    // If the holding is a mutual fund / AMC, classify under mutual_fund with appropriate subType
    if (isFundName) {
      if (/hybrid|dynamic|balanced/i.test(lowerType)) {
        return { assetType: 'mutual_fund', subType: normType || 'Hybrid Mutual Fund', sector: explicitSector };
      }
      if (/debt|liquid|gilt|money\s*market|bond/i.test(lowerType)) {
        return { assetType: 'mutual_fund', subType: normType || 'Debt Mutual Fund', sector: explicitSector };
      }
      return { assetType: 'mutual_fund', subType: normType || 'Equity Mutual Fund', sector: explicitSector };
    }

    if (/equity\s*mutual|equity.*fund|mf.*equity/i.test(lowerType)) {
      return { assetType: 'mutual_fund', subType: normType, sector: explicitSector };
    }
    if (/hybrid\s*mutual|hybrid.*fund|balanced.*fund|dynamic\s*asset/i.test(lowerType)) {
      return { assetType: 'mutual_fund', subType: normType, sector: explicitSector };
    }
    if (/debt\s*mutual|debt.*fund|liquid.*fund/i.test(lowerType)) {
      return { assetType: 'mutual_fund', subType: normType, sector: explicitSector };
    }
    if (/mutual\s*fund|\bmf\b/i.test(lowerType)) {
      return { assetType: 'mutual_fund', subType: normType, sector: explicitSector };
    }
    if (/hybrid/i.test(lowerType)) {
      return { assetType: 'mutual_fund', subType: normType, sector: explicitSector };
    }
    if (/liquid/i.test(lowerType)) {
      return { assetType: 'mutual_fund', subType: normType, sector: explicitSector };
    }
    if (/stock|equity|share/i.test(lowerType)) {
      return {
        assetType: 'stocks',
        subType: normType,
        sector: explicitSector || detectStockSector(name) || undefined,
      };
    }
    if (/debt|bond|debenture|gilt/i.test(lowerType)) {
      return { assetType: 'fd_rd', subType: normType, sector: explicitSector };
    }
    if (/gold|silver|sgb|precious/i.test(lowerType)) {
      return { assetType: 'gold', subType: normType, sector: explicitSector };
    }
    if (/crypto|bitcoin|ethereum/i.test(lowerType)) {
      return { assetType: 'crypto', subType: normType, sector: explicitSector };
    }
    if (/fd|fixed\s*deposit|rd/i.test(lowerType)) {
      return { assetType: 'fd_rd', subType: normType, sector: explicitSector };
    }
    if (/ppf|epf|nps|provident|pension|retire/i.test(lowerType)) {
      return { assetType: 'ppf_epf', subType: normType, sector: explicitSector };
    }
    if (/real\s*estate|reit|property/i.test(lowerType)) {
      return { assetType: 'real_estate', subType: normType, sector: explicitSector };
    }

    // Default to 'other' but preserve the exact user-specified subType label from file
    return { assetType: 'other', subType: normType, sector: explicitSector };
  }

  // 2. Generic Mutual Fund detection
  const isMf =
    /\bfund\b|\bgrowth\b|\bdirect\b|\bregular\b|\belss\b|\bindex\b|\bhybrid\b|\barbitrage\b|\bliquid\b|\bdebt\b|\bovernight\b|\bdividend\b|\bidcw\b|\bbalanced\b|\bbluechip\b|\bflexi\b|\bsmall\s*cap\b|\bmid\s*cap\b|\blarge\s*cap\b|\bmulti\s*cap\b|\bcontra\b|\bthematic\b|\bsectoral\b|\bopportunities\b|\bemerging\b|\bglobal\b|\binternational\b|\boverseas\b/.test(
      lowerName
    );

  if (isMf) {
    if (/\bliquid\b|\bovernight\b|\bdebt\b|\bmoney\s*market\b|\bcorporate\s*bond\b|\bgilt\b|\btreasury\b/.test(lowerName)) {
      return { assetType: 'mutual_fund', subType: 'Debt Mutual Fund', sector: explicitSector };
    }
    if (/\bhybrid\b|\bbalanced\s*advantage\b|\bbalanced\b|\bmulti\s*asset\b|\barbitrage\b|\baggressive\s*hybrid\b/.test(lowerName)) {
      return { assetType: 'mutual_fund', subType: 'Hybrid Mutual Fund', sector: explicitSector };
    }
    return { assetType: 'mutual_fund', subType: 'Equity Mutual Fund', sector: explicitSector };
  }

  // 3. Gold & Precious Metals
  if (/\bgold\b|\bsilver\b|\bsgb\b|\bsovereign\b|\bplatinum\b/.test(lowerName)) {
    return { assetType: 'gold', subType: 'Gold & Precious Metals', sector: explicitSector };
  }

  // 4. Fixed Income / Deposit
  if (/\bfd\b|\bfixed\s*deposit\b|\brecurring\s*deposit\b|\brd\b|\bbond\b|\bdebenture\b|\bncd\b/.test(lowerName)) {
    return { assetType: 'fd_rd', subType: 'Fixed Deposit / Bonds', sector: explicitSector };
  }

  // 5. Crypto
  if (/\bbitcoin\b|\bbtc\b|\bethereum\b|\beth\b|\bcrypto\b|\bsolana\b|\btoken\b|\bnft\b/.test(lowerName)) {
    return { assetType: 'crypto', subType: 'Cryptocurrency', sector: explicitSector };
  }

  // 6. Retirement & Provident
  if (/\bppf\b|\bepf\b|\bnps\b|\bprovident\b|\bpension\b|\bretirement\b/.test(lowerName)) {
    return { assetType: 'ppf_epf', subType: 'Retirement & Provident', sector: explicitSector };
  }

  // 7. Real Estate
  if (/\breit\b|\bland\b|\bplot\b|\bproperty\b|\bflat\b|\bapartment\b|\bhouse\b/.test(lowerName)) {
    return { assetType: 'real_estate', subType: 'Real Estate & REITs', sector: explicitSector };
  }

  // 8. Stocks & Equities
  const isStock =
    /\bltd\b|\blimited\b|\bshares\b|\bequity\b|\betf\b|\bnse\b|\bbse\b/.test(lowerName) ||
    /^[A-Z]{2,10}$/.test(name.trim());

  if (isStock) {
    return { assetType: 'stocks', subType: 'Stock / Equity', sector: explicitSector };
  }

  return { assetType: 'other', subType: 'Other Asset', sector: explicitSector };
}
