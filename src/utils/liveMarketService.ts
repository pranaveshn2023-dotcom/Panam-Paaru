import { AssetType } from '../types';

// In-memory cache for live NAVs to prevent duplicate network calls
const navCache = new Map<string, { nav: number; date: string; schemeName: string }>();

// Persistent localStorage cache key
const LS_CACHE_KEY = 'paanam_mf_nav_cache_v1';

function getPersistentCache(): Record<string, { nav: number; date: string; schemeName: string; timestamp: number }> {
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePersistentCache(key: string, data: { nav: number; date: string; schemeName: string }) {
  try {
    const cache = getPersistentCache();
    cache[key.toLowerCase().trim()] = { ...data, timestamp: Date.now() };
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore localStorage errors
  }
}

/**
 * Clean scheme name for AMFI search query
 */
export function cleanSearchQuery(raw: string): string {
  return raw
    .replace(/^(name\s+of\s+(the\s+)?scheme|scheme\s*name|scheme)\s*[:：]\s*/i, '')
    .replace(/\b(mutual\s*fund|amc|direct|regular|growth|idcw|payout|reinvestment|plan|option)\b/gi, '')
    .replace(/[\.\(\)₹\$\[\]\/\\-]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Fetch official AMFI live NAV dynamically for any Indian Mutual Fund
 */
export async function fetchAmfiNav(
  fundName: string
): Promise<{ nav: number; date: string; schemeName: string; schemeCode?: number } | null> {
  const normKey = fundName.toLowerCase().trim();

  // 1. Check in-memory cache
  if (navCache.has(normKey)) {
    return navCache.get(normKey)!;
  }

  // 2. Check persistent localStorage cache (valid for 6 hours)
  const pCache = getPersistentCache();
  const cached = pCache[normKey];
  if (cached && Date.now() - cached.timestamp < 6 * 60 * 60 * 1000) {
    navCache.set(normKey, cached);
    return cached;
  }

  try {
    // 3. Search scheme in AMFI directory via api.mfapi.in
    const query = cleanSearchQuery(fundName);
    if (query.length < 3) return null;

    const searchRes = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(query)}`);
    if (!searchRes.ok) return null;

    const list: { schemeCode: number; schemeName: string }[] = await searchRes.json();
    if (!list || list.length === 0) return null;

    // Pick best match: prioritize Direct & Growth if specified in original fundName
    const isDirect = /direct/i.test(fundName);
    const isGrowth = /growth/i.test(fundName);

    let best = list[0];
    for (const item of list) {
      const itemLower = item.schemeName.toLowerCase();
      const itemDirect = itemLower.includes('direct');
      const itemGrowth = itemLower.includes('growth');

      if (isDirect === itemDirect && isGrowth === itemGrowth) {
        best = item;
        break;
      } else if (isDirect && itemDirect) {
        best = item;
      }
    }

    // 4. Fetch latest NAV data for chosen schemeCode
    const detailRes = await fetch(`https://api.mfapi.in/mf/${best.schemeCode}`);
    if (!detailRes.ok) return null;

    const details = await detailRes.json();
    if (!details.data || details.data.length === 0) return null;

    const latest = details.data[0];
    const navNum = parseFloat(latest.nav);
    if (isNaN(navNum) || navNum <= 0) return null;

    const result = {
      nav: navNum,
      date: latest.date,
      schemeName: details.meta?.scheme_name || best.schemeName,
      schemeCode: best.schemeCode,
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
 * Fetch live stock/ETF/commodity quote dynamically with ZERO hardcoding
 */
export async function fetchLiveStockPrice(
  nameOrSymbol: string
): Promise<{ price: number; prevClose?: number; symbol?: string } | null> {
  const clean = nameOrSymbol.trim().toUpperCase();
  const candidates: string[] = [];

  if (clean.endsWith('.NS') || clean.endsWith('.BO') || clean.endsWith('-INR') || clean.endsWith('-USD')) {
    candidates.push(clean);
  }

  // Extract individual alphanumeric tokens (e.g. from 'AXISAMC-GOLDAXIS' -> 'AXISAMC', 'GOLDAXIS')
  const tokens = clean.split(/[^A-Z0-9]+/).filter((t) => t.length >= 2 && t.length <= 14);

  // Dynamic Yahoo search for unhandled symbols
  const searchQueries = [clean];
  if (tokens.length > 1) {
    searchQueries.push(tokens.join(' '));
    for (const t of tokens) {
      if (t.length >= 4 && !searchQueries.includes(t)) {
        searchQueries.push(t);
      }
    }
  }

  for (const sq of searchQueries) {
    try {
      const searchUrl = `https://corsproxy.io/?url=${encodeURIComponent(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sq)}&quotesCount=5`)}`;
      const sRes = await fetch(searchUrl, { signal: AbortSignal.timeout(3000) });
      if (sRes.ok) {
        const sData: any = await sRes.json();
        for (const q of sData?.quotes || []) {
          if (q.symbol && !candidates.includes(q.symbol)) {
            candidates.push(q.symbol);
          }
        }
      }
    } catch {}
  }

  for (const sym of candidates) {
    const url = `https://corsproxy.io/?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}`)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data: any = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (meta && typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0) {
          const change = typeof meta.fulldayChange === 'number' ? meta.fulldayChange : typeof meta.regularMarketChange === 'number' ? meta.regularMarketChange : undefined;
          const prevClose = change !== undefined ? meta.regularMarketPrice - change : (meta.previousClose || meta.chartPreviousClose);
          return {
            price: meta.regularMarketPrice,
            prevClose,
            symbol: sym,
          };
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Dedicated crypto price fetcher using CoinGecko (INR) + Yahoo Finance fallback.
 * CoinGecko provides reliable, real-time crypto prices in INR without API keys.
 */
export async function fetchLiveCryptoPrice(
  nameOrSymbol: string
): Promise<{ price: number; prevClose?: number; symbol?: string } | null> {
  const clean = nameOrSymbol.trim().toLowerCase()
    .replace(/\s*(coin|token|crypto|currency|inr|usd|usdt)\s*/gi, '')
    .trim();

  if (!clean || clean.length < 2) return null;

  // 1. CoinGecko Search → Resolve coin ID dynamically
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
        const coinId = exact?.id || coins[0]?.id;

        if (coinId) {
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
        }
      }
    }
  } catch {}

  // 2. Fallback: Yahoo Finance with BTC-INR style symbols
  const upper = nameOrSymbol.trim().toUpperCase().replace(/\s*(COIN|TOKEN|CRYPTO|CURRENCY)\s*/gi, '').trim();
  const tokens = upper.split(/[^A-Z0-9]+/).filter((t) => t.length >= 2 && t.length <= 10);
  const candidates: string[] = [];
  for (const t of tokens) {
    if (t === 'INR' || t === 'USD' || t === 'USDT') continue;
    if (!candidates.includes(`${t}-INR`)) candidates.push(`${t}-INR`);
    if (!candidates.includes(`${t}-USD`)) candidates.push(`${t}-USD`);
  }

  for (const sym of candidates) {
    const url = `https://corsproxy.io/?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}`)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data: any = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (meta && typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0) {
          const change = typeof meta.fulldayChange === 'number' ? meta.fulldayChange : typeof meta.regularMarketChange === 'number' ? meta.regularMarketChange : undefined;
          const prevClose = change !== undefined ? meta.regularMarketPrice - change : (meta.previousClose || meta.chartPreviousClose);
          return { price: meta.regularMarketPrice, prevClose, symbol: sym };
        }
      }
    } catch {}
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
