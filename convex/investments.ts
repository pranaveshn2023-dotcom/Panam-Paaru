import { query, mutation, action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// Universal dynamic commodity and precious metal matcher from name or ticker symbols (Gold, Silver, DigiGold, SGB, Bullion)
const COMMODITY_TICKER_NAME_REGEX =
  /(?:gold(?!man)|silver|silve|sgb|sovereign.*gold|bullion|digi(?:tal)?\s*(?:gold|silver|metal)|precious\s*metal)/i;

function resolveCommoditySubtype(name: string): string {
  const lower = name.toLowerCase();
  const isSilver = /silver|silve/i.test(lower);
  const isSgb = /sgb|sovereign/i.test(lower);
  const isDigiGold = /digi(?:tal)?\s*(?:gold|silver|metal)/i.test(lower);
  const isFund = /fund|fof|mutual\s*fund|\bamc\b/i.test(lower);

  if (isSgb) return "Sovereign Gold Bond (SGB)";
  if (isDigiGold) return isSilver ? "Digital Silver" : "Digital Gold";
  if (isSilver) return isFund ? "Silver Fund" : "Silver ETF";
  if (isFund) return "Gold Fund";
  return "Gold ETF";
}

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

    // Query-level deduplication to ensure multiple duplicate uploads never show duplicate cards
    const dedupedMap = new Map<string, (typeof investments)[0]>();
    for (const inv of investments) {
      const folio = extractFolio(inv.notes) || extractFolio(inv.name);
      const nameKey = normalizeAssetKey(inv.name);
      const key = folio ? `f_${folio}` : `n_${nameKey || inv.name.trim().toLowerCase()}`;

      let matchKey: string | null = null;
      if (dedupedMap.has(key)) {
        matchKey = key;
      } else {
        for (const [k, v] of dedupedMap.entries()) {
          if (
            v.name.trim().toLowerCase() === inv.name.trim().toLowerCase() ||
            (nameKey && normalizeAssetKey(v.name) === nameKey)
          ) {
            matchKey = k;
            break;
          }
        }
      }

      if (matchKey) {
        const existing = dedupedMap.get(matchKey)!;
        const keepExisting =
          (existing.updatedAt || existing.createdAt || 0) >=
          (inv.updatedAt || inv.createdAt || 0);
        if (!keepExisting) {
          dedupedMap.delete(matchKey);
          dedupedMap.set(key, inv);
        }
      } else {
        dedupedMap.set(key, inv);
      }
    }

    const uniqueInvestments = Array.from(dedupedMap.values());

    // Dynamically classify commodity holdings (gold / silver) by name/ticker patterns
    const normalized = uniqueInvestments.map((inv) => {
      let assetType = inv.assetType;
      let subType = inv.subType;

      if (
        (assetType === "other" || assetType === "mutual_fund") &&
        (COMMODITY_TICKER_NAME_REGEX.test(inv.name || "") || COMMODITY_TICKER_NAME_REGEX.test(inv.subType || ""))
      ) {
        assetType = "gold";
        if (!subType || /^(other|other asset|equity mutual fund)$/i.test(subType.trim())) {
          subType = resolveCommoditySubtype(inv.name);
        }
      }

      return {
        ...inv,
        assetType,
        subType,
      };
    });

    let filtered = normalized;
    if (args.assetType && args.assetType !== "all") {
      filtered = normalized.filter((inv) => inv.assetType === args.assetType);
    }

    return filtered.map((inv) => {
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

    // Query-level deduplication for portfolio summary
    const dedupedMap = new Map<string, (typeof investments)[0]>();
    for (const inv of investments) {
      const folio = extractFolio(inv.notes) || extractFolio(inv.name);
      const nameKey = normalizeAssetKey(inv.name);
      const key = folio ? `f_${folio}` : `n_${nameKey || inv.name.trim().toLowerCase()}`;

      let matchKey: string | null = null;
      if (dedupedMap.has(key)) {
        matchKey = key;
      } else {
        for (const [k, v] of dedupedMap.entries()) {
          if (
            v.name.trim().toLowerCase() === inv.name.trim().toLowerCase() ||
            (nameKey && normalizeAssetKey(v.name) === nameKey)
          ) {
            matchKey = k;
            break;
          }
        }
      }

      if (matchKey) {
        const existing = dedupedMap.get(matchKey)!;
        const keepExisting =
          (existing.updatedAt || existing.createdAt || 0) >=
          (inv.updatedAt || inv.createdAt || 0);
        if (!keepExisting) {
          dedupedMap.delete(matchKey);
          dedupedMap.set(key, inv);
        }
      } else {
        dedupedMap.set(key, inv);
      }
    }

    const uniqueInvestments = Array.from(dedupedMap.values());

    let totalInvested = 0;
    let totalCurrentValue = 0;
    let totalMonthlySip = 0;

    const assetAllocationMap: Record<string, { invested: number; current: number; count: number }> = {};

    for (const rawInv of uniqueInvestments) {
      let assetType = rawInv.assetType;
      if (
        (assetType === "other" || assetType === "mutual_fund") &&
        (COMMODITY_TICKER_NAME_REGEX.test(rawInv.name || "") || COMMODITY_TICKER_NAME_REGEX.test(rawInv.subType || ""))
      ) {
        assetType = "gold";
      }

      totalInvested += rawInv.investedAmount;
      totalCurrentValue += rawInv.currentValue;
      if (rawInv.sipAmount) {
        totalMonthlySip += rawInv.sipAmount;
      }

      if (!assetAllocationMap[assetType]) {
        assetAllocationMap[assetType] = { invested: 0, current: 0, count: 0 };
      }
      assetAllocationMap[assetType].invested += rawInv.investedAmount;
      assetAllocationMap[assetType].current += rawInv.currentValue;
      assetAllocationMap[assetType].count += 1;
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

function extractFolio(text?: string): string | null {
  if (!text) return null;
  const m = text.match(/(?:folio|foliono|folio\s*no|acct|account)\s*[:#\-]?\s*([a-z0-9/_-]+)/i);
  return m ? m[1].toLowerCase().replace(/[^a-z0-9]/g, "") : null;
}

function normalizeAssetKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_/\\]/g, " ")
    .replace(/\s*(direct|regular|growth|idcw|dividend|plan|option)\b/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

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

    // Retrieve existing user holdings for intelligent deduplication & overwrite
    const existingHoldings = await ctx.db
      .query("investments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    let insertedCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    for (const item of args.items) {
      if (!item.name.trim()) continue;

      const itemFolio = extractFolio(item.notes) || extractFolio(item.name);
      const itemKey = normalizeAssetKey(item.name);

      // Find matching existing holding
      const matchIndex = existingHoldings.findIndex((ex) => {
        // 1. Exact folio number match
        if (itemFolio) {
          const exFolio = extractFolio(ex.notes) || extractFolio(ex.name);
          if (exFolio && exFolio === itemFolio) return true;
        }

        // 2. Exact name match (case-insensitive)
        if (ex.name.trim().toLowerCase() === item.name.trim().toLowerCase()) {
          return true;
        }

        // 3. Normalized key match (stripping direct/growth/punctuation)
        if (itemKey.length >= 4) {
          const exKey = normalizeAssetKey(ex.name);
          if (exKey === itemKey) return true;
        }

        return false;
      });

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

      if (matchIndex >= 0) {
        const existing = existingHoldings[matchIndex];

        // Check whether values changed or if it's identical old data
        const valDiff = Math.abs(existing.currentValue - Math.max(0, item.currentValue));
        const invDiff = Math.abs(existing.investedAmount - Math.max(0, item.investedAmount));
        const unitsDiff =
          item.units !== undefined && existing.units !== undefined
            ? Math.abs(existing.units - item.units)
            : 0;

        const hasChanges =
          valDiff > 0.01 ||
          invDiff > 0.01 ||
          unitsDiff > 0.0001 ||
          (derivedCurrentPrice && existing.currentPrice !== derivedCurrentPrice) ||
          (item.xirr && existing.xirr !== item.xirr);

        if (hasChanges) {
          // Overwrite existing holding with new values from updated statement
          await ctx.db.patch(existing._id, {
            currentValue: Math.max(0, item.currentValue),
            investedAmount: item.investedAmount > 0 ? item.investedAmount : existing.investedAmount,
            units: item.units !== undefined ? item.units : existing.units,
            currentPrice: derivedCurrentPrice !== undefined ? derivedCurrentPrice : existing.currentPrice,
            buyPrice: derivedBuyPrice !== undefined ? derivedBuyPrice : existing.buyPrice,
            xirr: item.xirr || existing.xirr,
            assetType: item.assetType || existing.assetType,
            subType: item.subType || existing.subType,
            sector: item.sector || existing.sector,
            broker: item.broker || args.broker || existing.broker,
            notes: item.notes || existing.notes,
            importBatchId: batchId || existing.importBatchId,
            updatedAt: now,
          });

          // Update memory copy to prevent duplicate updates within the same batch
          existingHoldings[matchIndex] = {
            ...existing,
            currentValue: Math.max(0, item.currentValue),
            investedAmount: item.investedAmount > 0 ? item.investedAmount : existing.investedAmount,
            units: item.units !== undefined ? item.units : existing.units,
            currentPrice: derivedCurrentPrice !== undefined ? derivedCurrentPrice : existing.currentPrice,
            buyPrice: derivedBuyPrice !== undefined ? derivedBuyPrice : existing.buyPrice,
            xirr: item.xirr || existing.xirr,
            updatedAt: now,
          };

          updatedCount++;
        } else {
          // Identical / old file data: no changes needed, keep existing asset
          unchangedCount++;
        }
      } else {
        // Genuine new asset: insert
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
        insertedCount++;

        // Add to memory copy so subsequent rows in same batch also deduplicate
        existingHoldings.push({
          _id: id,
          _creationTime: now,
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
      }
    }

    return {
      success: true,
      count: insertedIds.length,
      inserted: insertedCount,
      updated: updatedCount,
      unchanged: unchangedCount,
      batchId,
    };
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
// Real-Time Market Feed Helpers (NSE/BSE, Crypto & AMFI) — ZERO HARDCODING
// ──────────────────────────────────────────

async function fetchStockQuote(name: string): Promise<{ price: number; prevClose?: number; symbol?: string } | null> {
  const clean = name.trim().toUpperCase();
  const candidates: string[] = [];

  if (clean.endsWith('.NS') || clean.endsWith('.BO') || clean.endsWith('-INR') || clean.endsWith('-USD')) {
    candidates.push(clean);
  }

  // Extract individual alphanumeric tokens (e.g. from 'AXISAMC-GOLDAXIS' -> 'AXISAMC', 'GOLDAXIS')
  const tokens = clean.split(/[^A-Z0-9]+/).filter((t) => t.length >= 2 && t.length <= 14);
  for (const t of tokens) {
    if (!candidates.includes(`${t}.NS`)) candidates.push(`${t}.NS`);
    if (!candidates.includes(`${t}.BO`)) candidates.push(`${t}.BO`);
  }

  // Dynamic Yahoo Finance search queries with zero hardcoding
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
      const searchRes = await fetch(
        `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sq)}&quotesCount=5`,
        { signal: AbortSignal.timeout(3500) }
      );
      if (searchRes.ok) {
        const data: any = await searchRes.json();
        for (const q of data?.quotes || []) {
          if (q.symbol && !candidates.includes(q.symbol)) {
            candidates.push(q.symbol);
          }
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
          symbol: sym,
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
          if (mf && mf.nav > 0) {
            livePrice = mf.nav;
          } else {
            // Check if exchange-traded ETF or listed product
            const stk = await fetchStockQuote(inv.name);
            if (stk && stk.price > 0) livePrice = stk.price;
          }
        } else if (inv.assetType === "crypto") {
          const cry = await fetchStockQuote(inv.name.includes("INR") ? inv.name : `${inv.name} INR`);
          if (cry && cry.price > 0) {
            livePrice = cry.price;
          } else {
            const fallback = await fetchStockQuote(inv.name);
            if (fallback && fallback.price > 0) livePrice = fallback.price;
          }
        } else {
          // Stocks, Gold ETFs, Silver ETFs, SGBs, Commodities, REITs
          const stk = await fetchStockQuote(inv.name);
          if (stk && stk.price > 0) livePrice = stk.price;
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

/**
 * Automatically reclassifies commodity (gold & silver) holdings in the user's database portfolio
 * without modifying invested amounts, current values, or units.
 */
export const autoClassifyCommodities = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { count: 0 };

    const holdings = await ctx.db
      .query("investments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    let updatedCount = 0;
    for (const inv of holdings) {
      if (
        (inv.assetType === "other" || inv.assetType === "mutual_fund") &&
        (COMMODITY_TICKER_NAME_REGEX.test(inv.name || "") || COMMODITY_TICKER_NAME_REGEX.test(inv.subType || ""))
      ) {
        const newSubType =
          !inv.subType || /^(other|other asset|equity mutual fund)$/i.test(inv.subType.trim())
            ? resolveCommoditySubtype(inv.name)
            : inv.subType;

        await ctx.db.patch(inv._id, {
          assetType: "gold",
          subType: newSubType,
          sector: inv.sector || "Commodities",
          updatedAt: Date.now(),
        });
        updatedCount++;
      }
    }
    return { count: updatedCount };
  },
});

/**
 * Deduplicates any existing duplicate holdings in the user's database portfolio
 * that were created by previous duplicate file uploads, keeping the latest/most accurate record.
 */
export const autoDeduplicateExistingHoldings = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { removedCount: 0 };

    const holdings = await ctx.db
      .query("investments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const seenMap = new Map<string, (typeof holdings)[0]>();
    let removedCount = 0;

    for (const holding of holdings) {
      const folio = extractFolio(holding.notes) || extractFolio(holding.name);
      const nameKey = normalizeAssetKey(holding.name);
      const key = folio ? `f_${folio}` : `n_${nameKey || holding.name.trim().toLowerCase()}`;

      let matchKey: string | null = null;
      if (seenMap.has(key)) {
        matchKey = key;
      } else {
        for (const [k, v] of seenMap.entries()) {
          if (
            v.name.trim().toLowerCase() === holding.name.trim().toLowerCase() ||
            (nameKey && normalizeAssetKey(v.name) === nameKey)
          ) {
            matchKey = k;
            break;
          }
        }
      }

      if (matchKey) {
        const existing = seenMap.get(matchKey)!;
        const keepExisting =
          (existing.updatedAt || existing.createdAt || 0) >=
          (holding.updatedAt || holding.createdAt || 0);

        if (keepExisting) {
          await ctx.db.delete(holding._id);
        } else {
          await ctx.db.delete(existing._id);
          seenMap.delete(matchKey);
          seenMap.set(key, holding);
        }
        removedCount++;
      } else {
        seenMap.set(key, holding);
      }
    }

    return { removedCount };
  },
});
