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
    .replace(/\b(direct|regular|growth|idcw|payout|reinvestment|plan|option)\b/gi, '')
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

  // 1. If document provided an explicit type column, honor the document's real value!
  if (normType) {
    if (/equity\s*mutual|equity.*fund|mf.*equity/i.test(lowerType)) {
      return { assetType: 'mutual_fund', subType: normType, sector: explicitSector };
    }
    if (/hybrid\s*mutual|hybrid.*fund|balanced.*fund/i.test(lowerType)) {
      return { assetType: 'mutual_fund', subType: normType, sector: explicitSector };
    }
    if (/debt\s*mutual|debt.*fund|liquid.*fund/i.test(lowerType)) {
      return { assetType: 'mutual_fund', subType: normType, sector: explicitSector };
    }
    if (/mutual\s*fund|\bmf\b/i.test(lowerType)) {
      return { assetType: 'mutual_fund', subType: normType, sector: explicitSector };
    }
    if (/stock|equity|share/i.test(lowerType)) {
      return { assetType: 'stocks', subType: normType, sector: explicitSector };
    }
    if (/gold|silver|sgb|precious/i.test(lowerType)) {
      return { assetType: 'gold', subType: normType, sector: explicitSector };
    }
    if (/crypto|bitcoin/i.test(lowerType)) {
      return { assetType: 'crypto', subType: normType, sector: explicitSector };
    }
    if (/fd|fixed\s*deposit|rd|bond|debenture/i.test(lowerType)) {
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
