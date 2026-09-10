import { query, mutation, action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: {
    assetType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    let investments = await ctx.db
      .query("investments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    if (args.assetType && args.assetType !== "all") {
      investments = investments.filter((inv) => inv.assetType === args.assetType);
    }

    return investments.map((inv) => {
      const returnsAmount = inv.currentValue - inv.investedAmount;
      const returnsPercent =
        inv.investedAmount > 0
          ? Number(((returnsAmount / inv.investedAmount) * 100).toFixed(2))
          : 0;

      const derivedCurrentPrice =
        inv.currentPrice && inv.currentPrice > 0
          ? inv.currentPrice
          : inv.units && inv.units > 0 && inv.currentValue > 0
          ? Math.round((inv.currentValue / inv.units) * 100) / 100
          : undefined;

      const derivedBuyPrice =
        inv.buyPrice && inv.buyPrice > 0
          ? inv.buyPrice
          : inv.units && inv.units > 0 && inv.investedAmount > 0
          ? Math.round((inv.investedAmount / inv.units) * 100) / 100
          : undefined;

      return {
        ...inv,
        currentPrice: derivedCurrentPrice,
        buyPrice: derivedBuyPrice,
        returnsAmount,
        returnsPercent,
        isPositive: returnsAmount >= 0,
      };
    });
  },
});

export const getPortfolioSummary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const investments = await ctx.db
      .query("investments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    let totalInvested = 0;
    let totalCurrentValue = 0;
    let totalMonthlySip = 0;

    const assetAllocationMap: Record<string, { invested: number; current: number; count: number }> = {};

    for (const inv of investments) {
      totalInvested += inv.investedAmount;
      totalCurrentValue += inv.currentValue;
      if (inv.sipAmount) {
        totalMonthlySip += inv.sipAmount;
      }

      if (!assetAllocationMap[inv.assetType]) {
        assetAllocationMap[inv.assetType] = { invested: 0, current: 0, count: 0 };
      }
      assetAllocationMap[inv.assetType].invested += inv.investedAmount;
      assetAllocationMap[inv.assetType].current += inv.currentValue;
      assetAllocationMap[inv.assetType].count += 1;
    }

    const totalReturnsAmount = totalCurrentValue - totalInvested;
    const totalReturnsPercent =
      totalInvested > 0
        ? Number(((totalReturnsAmount / totalInvested) * 100).toFixed(2))
        : 0;

    const assetBreakdown = Object.entries(assetAllocationMap).map(([type, data]) => ({
      assetType: type,
      investedAmount: data.invested,
      currentValue: data.current,
      itemCount: data.count,
      allocationPercent:
        totalCurrentValue > 0
          ? Number(((data.current / totalCurrentValue) * 100).toFixed(1))
          : 0,
    }));

    return {
      totalInvested,
      totalCurrentValue,
      totalReturnsAmount,
      totalReturnsPercent,
      totalMonthlySip,
      totalHoldingsCount: investments.length,
      assetBreakdown,
    };
  },
});

export const add = mutation({
  args: {
    name: v.string(),
    assetType: v.union(
      v.literal("mutual_fund"),
      v.literal("stocks"),
      v.literal("fd_rd"),
      v.literal("gold"),
      v.literal("crypto"),
      v.literal("ppf_epf"),
      v.literal("real_estate"),
      v.literal("other")
    ),
    investedAmount: v.number(),
    currentValue: v.number(),
    units: v.optional(v.number()),
    buyPrice: v.optional(v.number()),
    currentPrice: v.optional(v.number()),
    sipAmount: v.optional(v.number()),
    sipDay: v.optional(v.number()),
    xirr: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const derivedCurrentPrice =
      args.currentPrice && args.currentPrice > 0
        ? args.currentPrice
        : args.units && args.units > 0 && args.currentValue > 0
        ? Math.round((args.currentValue / args.units) * 100) / 100
        : undefined;

    const derivedBuyPrice =
      args.buyPrice && args.buyPrice > 0
        ? args.buyPrice
        : args.units && args.units > 0 && args.investedAmount > 0
        ? Math.round((args.investedAmount / args.units) * 100) / 100
        : undefined;

    const id = await ctx.db.insert("investments", {
      userId,
      name: args.name.trim(),
      assetType: args.assetType,
      investedAmount: Math.max(0, args.investedAmount),
      currentValue: Math.max(0, args.currentValue),
      units: args.units,
      buyPrice: derivedBuyPrice,
      currentPrice: derivedCurrentPrice,
      sipAmount: args.sipAmount,
      sipDay: args.sipDay,
      xirr: args.xirr,
      notes: args.notes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return id;
  },
});

export const batchAdd = mutation({
  args: {
    fileName: v.optional(v.string()),
    broker: v.optional(v.string()),
    items: v.array(
      v.object({
        name: v.string(),
        assetType: v.union(
          v.literal("mutual_fund"),
          v.literal("stocks"),
          v.literal("fd_rd"),
          v.literal("gold"),
          v.literal("crypto"),
          v.literal("ppf_epf"),
          v.literal("real_estate"),
          v.literal("other")
        ),
        subType: v.optional(v.string()),
        sector: v.optional(v.string()),
        broker: v.optional(v.string()),
        investedAmount: v.number(),
        currentValue: v.number(),
        units: v.optional(v.number()),
        buyPrice: v.optional(v.number()),
        currentPrice: v.optional(v.number()),
        sipAmount: v.optional(v.number()),
        sipDay: v.optional(v.number()),
        xirr: v.optional(v.string()),
        notes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const insertedIds = [];
    const now = Date.now();
    let totalBatchValue = 0;

    // Create import batch record if fileName or items present
    let batchId: string | undefined = undefined;
    if (args.items.length > 0) {
      for (const it of args.items) {
        totalBatchValue += it.currentValue || it.investedAmount || 0;
      }
      const bDoc = await ctx.db.insert("importBatches", {
        userId,
        fileName: args.fileName || "Statement Import",
        broker: args.broker,
        type: "investments",
        itemCount: args.items.length,
        totalValue: Number(totalBatchValue.toFixed(2)),
        createdAt: now,
      });
      batchId = bDoc;
    }

    for (const item of args.items) {
      if (!item.name.trim()) continue;
        const derivedCurrentPrice =
          item.currentPrice && item.currentPrice > 0
            ? item.currentPrice
            : item.units && item.units > 0 && item.currentValue > 0
            ? Math.round((item.currentValue / item.units) * 100) / 100
            : undefined;

        const derivedBuyPrice =
          item.buyPrice && item.buyPrice > 0
            ? item.buyPrice
            : item.units && item.units > 0 && item.investedAmount > 0
            ? Math.round((item.investedAmount / item.units) * 100) / 100
            : undefined;

        const id = await ctx.db.insert("investments", {
          userId,
          name: item.name.trim(),
          assetType: item.assetType,
          subType: item.subType,
          sector: item.sector,
          broker: item.broker || args.broker,
          importBatchId: batchId,
          investedAmount: Math.max(0, item.investedAmount),
          currentValue: Math.max(0, item.currentValue),
          units: item.units,
          buyPrice: derivedBuyPrice,
          currentPrice: derivedCurrentPrice,
          sipAmount: item.sipAmount,
          sipDay: item.sipDay,
          xirr: item.xirr,
          notes: item.notes,
          createdAt: now,
          updatedAt: now,
        });
      insertedIds.push(id);
    }

    return { success: true, count: insertedIds.length, batchId };
  },
});

export const listImportBatches = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("importBatches")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
  },
});

export const undoImportBatch = mutation({
  args: {
    batchId: v.id("importBatches"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const batch = await ctx.db.get(args.batchId);
    if (!batch || batch.userId !== userId) {
      throw new Error("Batch not found or unauthorized");
    }

    // Delete all investments linked to this batchId
    const investments = await ctx.db
      .query("investments")
      .withIndex("by_user_batch", (q) =>
        q.eq("userId", userId).eq("importBatchId", args.batchId)
      )
      .collect();

    for (const inv of investments) {
      await ctx.db.delete(inv._id);
    }

    // Delete the batch record
    await ctx.db.delete(args.batchId);

    return { success: true, removedCount: investments.length };
  },
});

export const batchUpdateLivePrices = mutation({
  args: {
    updates: v.array(
      v.object({
        id: v.id("investments"),
        currentValue: v.number(),
        currentPrice: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const now = Date.now();
    for (const u of args.updates) {
      const inv = await ctx.db.get(u.id);
      if (inv && inv.userId === userId) {
        await ctx.db.patch(u.id, {
          currentValue: Math.max(0, u.currentValue),
          currentPrice: u.currentPrice ?? inv.currentPrice,
          updatedAt: now,
        });
      }
    }

    return { success: true, count: args.updates.length };
  },
});

export const update = mutation({
  args: {
    id: v.id("investments"),
    name: v.string(),
    assetType: v.union(
      v.literal("mutual_fund"),
      v.literal("stocks"),
      v.literal("fd_rd"),
      v.literal("gold"),
      v.literal("crypto"),
      v.literal("ppf_epf"),
      v.literal("real_estate"),
      v.literal("other")
    ),
    investedAmount: v.number(),
    currentValue: v.number(),
    units: v.optional(v.number()),
    buyPrice: v.optional(v.number()),
    currentPrice: v.optional(v.number()),
    sipAmount: v.optional(v.number()),
    sipDay: v.optional(v.number()),
    xirr: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Investment not found or unauthorized");
    }

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      assetType: args.assetType,
      investedAmount: Math.max(0, args.investedAmount),
      currentValue: Math.max(0, args.currentValue),
      units: args.units,
      buyPrice: args.buyPrice,
      currentPrice: args.currentPrice,
      sipAmount: args.sipAmount,
      sipDay: args.sipDay,
      xirr: args.xirr,
      notes: args.notes,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const quickUpdateValue = mutation({
  args: {
    id: v.id("investments"),
    currentValue: v.number(),
    currentPrice: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Investment not found or unauthorized");
    }

    await ctx.db.patch(args.id, {
      currentValue: Math.max(0, args.currentValue),
      currentPrice: args.currentPrice ?? existing.currentPrice,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const remove = mutation({
  args: {
    id: v.id("investments"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Investment not found or unauthorized");
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

// ──────────────────────────────────────────
// Real-Time Market Feed Helpers (NSE/BSE & AMFI)
// ──────────────────────────────────────────

async function fetchStockQuote(name: string): Promise<{ price: number; prevClose?: number } | null> {
  const clean = name.trim().toUpperCase();
  const candidates: string[] = [];

  if (clean.endsWith('.NS') || clean.endsWith('.BO')) {
    candidates.push(clean);
  } else {
    // Check if clean is a direct ticker e.g. RELIANCE, TCS, INFY, ITC, SBIN, HDFCBANK
    if (/^[A-Z0-9]{2,12}$/.test(clean)) {
      candidates.push(`${clean}.NS`, `${clean}.BO`);
    } else {
      const stripped = clean
        .replace(/\b(LIMITED|LTD|INDUSTRIES|CORP|CORPORATION|HOLDINGS|INDIA|ENTERPRISES|TECHNOLOGIES|SERVICES)\b/gi, '')
        .trim();
      if (/^[A-Z0-9]{2,12}$/.test(stripped)) {
        candidates.push(`${stripped}.NS`, `${stripped}.BO`);
      }
    }
  }

  // If candidate is empty or search needed, query Yahoo Finance search
  if (candidates.length === 0) {
    try {
      const searchRes = await fetch(
        `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(name)}&quotesCount=3&newsCount=0`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (searchRes.ok) {
        const data: any = await searchRes.json();
        const quotes = data?.quotes || [];
        const nsQuote = quotes.find((q: any) => q.symbol?.endsWith('.NS') || q.symbol?.endsWith('.BO')) || quotes[0];
        if (nsQuote?.symbol) {
          candidates.push(nsQuote.symbol);
        }
      }
    } catch {}
  }

  for (const sym of candidates) {
    try {
      const chartRes = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (!chartRes.ok) continue;
      const data: any = await chartRes.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta && typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0) {
        const change = typeof meta.fulldayChange === 'number' ? meta.fulldayChange : typeof meta.regularMarketChange === 'number' ? meta.regularMarketChange : undefined;
        const prevClose = change !== undefined ? meta.regularMarketPrice - change : (meta.previousClose || meta.chartPreviousClose);
        return {
          price: meta.regularMarketPrice,
          prevClose,
        };
      }
    } catch {}
  }

  return null;
}

async function fetchMfNav(name: string): Promise<{ nav: number; date?: string; prevNav?: number } | null> {
  const cleanQuery = name
    .replace(/^(name\s+of\s+(the\s+)?scheme|scheme\s*name|scheme)\s*[:：]\s*/i, '')
    .replace(/\b(mutual\s*fund|amc|direct|regular|growth|idcw|payout|reinvestment|plan|option)\b/gi, '')
    .replace(/\bppfas\b/gi, 'Parag Parikh')
    .replace(/\bdynamic\s*asset\s*allocation\b/gi, 'Balanced Advantage')
    .replace(/[\.\(\)₹\$\[\]\/\\-]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (cleanQuery.length < 3) return null;

  const queries = [cleanQuery];
  const words = cleanQuery.split(' ').filter(Boolean);
  if (words.length > 3) {
    queries.push(words.slice(0, 3).join(' '));
  }

  for (const query of queries) {
    try {
      const searchRes = await fetch(
        `https://api.mfapi.in/mf/search?q=${encodeURIComponent(query)}`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (!searchRes.ok) continue;
      const list: any[] = await searchRes.json();
      if (!list || list.length === 0) continue;

      const isDirect = /direct/i.test(name);
      const isGrowth = /growth/i.test(name);

      let best = list[0];
      for (const item of list) {
        const itemLower = String(item.schemeName || '').toLowerCase();
        const itemDirect = itemLower.includes('direct');
        const itemGrowth = itemLower.includes('growth');

        if (isDirect === itemDirect && isGrowth === itemGrowth) {
          best = item;
          break;
        } else if (isDirect && itemDirect) {
          best = item;
        }
      }

      const detailRes = await fetch(
        `https://api.mfapi.in/mf/${best.schemeCode}`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (!detailRes.ok) continue;
      const details: any = await detailRes.json();
      const latest = details?.data?.[0];
      const prev = details?.data?.[1];

      if (latest && latest.nav) {
        const navNum = parseFloat(latest.nav);
        if (!isNaN(navNum) && navNum > 0) {
          return {
            nav: navNum,
            date: latest.date,
            prevNav: prev ? parseFloat(prev.nav) : undefined,
          };
        }
      }
    } catch {}
  }

  return null;
}

async function fetchCryptoOrGoldPrice(name: string, assetType: string): Promise<{ price: number } | null> {
  const lower = name.toLowerCase();
  let ticker = '';
  if (assetType === 'crypto' || /crypto|bitcoin|btc/i.test(lower)) {
    if (/btc|bitcoin/i.test(lower)) ticker = 'BTC-INR';
    else if (/eth|ethereum/i.test(lower)) ticker = 'ETH-INR';
    else if (/sol|solana/i.test(lower)) ticker = 'SOL-INR';
  } else if (assetType === 'gold' || /gold|sgb/i.test(lower)) {
    ticker = 'GOLDBEES.NS';
  }

  if (ticker) {
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (r.ok) {
        const d: any = await r.json();
        const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (typeof price === 'number' && price > 0) return { price };
      }
    } catch {}
  }
  return null;
}

export const syncLiveMarketPrices = action({
  args: {
    investmentIds: v.optional(v.array(v.id("investments"))),
  },
  handler: async (ctx, args) => {
    const allInvestments: any[] = await ctx.runQuery(api.investments.list, {});
    if (!allInvestments || allInvestments.length === 0) {
      return { success: true, count: 0, updates: [] };
    }

    const targetList = args.investmentIds && args.investmentIds.length > 0
      ? allInvestments.filter((inv) => args.investmentIds!.includes(inv._id))
      : allInvestments;

    const updates: { id: any; currentValue: number; currentPrice?: number }[] = [];

    for (const inv of targetList) {
      try {
        let livePrice: number | null = null;

        if (inv.assetType === "mutual_fund") {
          const mf = await fetchMfNav(inv.name);
          if (mf && mf.nav > 0) livePrice = mf.nav;
        } else if (inv.assetType === "stocks") {
          const stk = await fetchStockQuote(inv.name);
          if (stk && stk.price > 0) livePrice = stk.price;
        } else if (inv.assetType === "crypto" || inv.assetType === "gold") {
          const cg = await fetchCryptoOrGoldPrice(inv.name, inv.assetType);
          if (cg && cg.price > 0) livePrice = cg.price;
        }

        if (livePrice !== null && livePrice > 0) {
          let updatedVal = inv.currentValue;

          if (inv.units && inv.units > 0) {
            updatedVal = Math.round(inv.units * livePrice * 100) / 100;
          } else if (inv.investedAmount > 0 && inv.buyPrice && inv.buyPrice > 0) {
            const derivedUnits = inv.investedAmount / inv.buyPrice;
            updatedVal = Math.round(derivedUnits * livePrice * 100) / 100;
          } else if (inv.currentPrice && inv.currentPrice > 0 && inv.currentValue > 0) {
            const ratio = livePrice / inv.currentPrice;
            updatedVal = Math.round(inv.currentValue * ratio * 100) / 100;
          } else {
            updatedVal = livePrice;
          }

          updates.push({
            id: inv._id,
            currentValue: updatedVal,
            currentPrice: livePrice,
          });
        }
      } catch (err) {
        console.warn(`[SyncLiveMarket] Error fetching price for ${inv.name}:`, err);
      }
    }

    if (updates.length > 0) {
      await ctx.runMutation(api.investments.batchUpdateLivePrices, { updates });
    }

    return { success: true, count: updates.length, updates };
  },
});

export const getMarketIndices = action({
  args: {},
  handler: async () => {
    const indices = [
      { key: "nifty50", symbol: "^NSEI", name: "NIFTY 50" },
      { key: "sensex", symbol: "^BSESN", name: "SENSEX" },
    ];
    const results: any[] = [];
    for (const idx of indices) {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(idx.symbol)}`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (res.ok) {
          const d: any = await res.json();
          const meta = d?.chart?.result?.[0]?.meta;
          if (meta && typeof meta.regularMarketPrice === 'number') {
            const price = meta.regularMarketPrice;

            // Use Yahoo Finance's exact live change & percent to prevent false divergence from stale chartPreviousClose
            let change = 0;
            if (typeof meta.fulldayChange === 'number' && !isNaN(meta.fulldayChange)) {
              change = meta.fulldayChange;
            } else if (typeof meta.regularMarketChange === 'number' && !isNaN(meta.regularMarketChange)) {
              change = meta.regularMarketChange;
            } else {
              const prev = meta.previousClose || meta.chartPreviousClose || price;
              change = price - prev;
            }

            let changePct = 0;
            if (typeof meta.regularMarketChangePercent === 'number' && !isNaN(meta.regularMarketChangePercent)) {
              changePct = Number(meta.regularMarketChangePercent.toFixed(2));
            } else if (typeof meta.fulldayChangePercent === 'number' && !isNaN(meta.fulldayChangePercent)) {
              changePct = Number(meta.fulldayChangePercent.toFixed(2));
            } else {
              const prev = price - change;
              changePct = prev > 0 ? Number(((change / prev) * 100).toFixed(2)) : 0;
            }

            results.push({
              name: idx.name,
              symbol: idx.symbol,
              price: Math.round(price * 100) / 100,
              change: Math.round(change * 100) / 100,
              changePercent: changePct,
              isPositive: change >= 0,
            });
          }
        }
      } catch {}
    }
    return results;
  },
});
