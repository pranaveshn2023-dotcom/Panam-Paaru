import { query, mutation, action, internalQuery, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
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

function getHoldingDedupeKey(name: string, notes?: string): string {
  const folio = extractFolio(notes) || extractFolio(name);
  const nameKey = normalizeAssetKey(name) || name.trim().toLowerCase();
  return folio ? `${nameKey}_f_${folio}` : `n_${nameKey}`;
}

function areHoldingsEquivalent(
  a: { name: string; notes?: string },
  b: { name: string; notes?: string }
): boolean {
  const aRaw = a.name.trim().toLowerCase();
  const bRaw = b.name.trim().toLowerCase();
  const aKey = normalizeAssetKey(a.name);
  const bKey = normalizeAssetKey(b.name);

  // Scheme/Asset Name MUST match (preventing different schemes under same AMC/Folio from colliding)
  const nameMatches =
    aRaw === bRaw ||
    (aKey.length >= 4 && bKey.length >= 4 && aKey === bKey);

  if (!nameMatches) return false;

  // If both have folio numbers, they must not conflict
  const aFolio = extractFolio(a.notes) || extractFolio(a.name);
  const bFolio = extractFolio(b.notes) || extractFolio(b.name);

  if (aFolio && bFolio && aFolio !== bFolio) {
    return false;
  }

  return true;
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
      const key = getHoldingDedupeKey(inv.name, inv.notes);

      let matchKey: string | null = null;
      if (dedupedMap.has(key)) {
        matchKey = key;
      } else {
        for (const [k, v] of dedupedMap.entries()) {
          if (areHoldingsEquivalent(v, inv)) {
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
      const key = getHoldingDedupeKey(inv.name, inv.notes);

      let matchKey: string | null = null;
      if (dedupedMap.has(key)) {
        matchKey = key;
      } else {
        for (const [k, v] of dedupedMap.entries()) {
          if (areHoldingsEquivalent(v, inv)) {
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

      // Find matching existing holding by scheme/stock name equivalence (preventing different schemes under same folio from colliding)
      const matchIndex = existingHoldings.findIndex((ex) => areHoldingsEquivalent(ex, item));

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
            name: item.name.trim(),
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
            name: item.name.trim(),
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

  const strippedCorporate = clean
    .replace(/\b(LIMITED|LTD|CORPORATION|CORP|COMPANY|CO|PLC|PVT|PRIVATE)\b\.?/gi, '')
    .trim();

  if (clean.endsWith('.NS') || clean.endsWith('.BO') || clean.endsWith('-INR') || clean.endsWith('-USD')) {
    candidates.push(clean);
  } else {
    if (/^[A-Z0-9]{1,14}$/.test(clean)) {
      candidates.push(`${clean}.NS`, `${clean}.BO`);
    }
    const compact = strippedCorporate.replace(/[^A-Z0-9]/g, '');
    if (compact.length >= 2 && compact.length <= 14 && !candidates.includes(`${compact}.NS`)) {
      candidates.push(`${compact}.NS`, `${compact}.BO`);
    }
  }

  // Extract individual alphanumeric tokens (e.g. from 'AXISAMC-GOLDAXIS' -> 'AXISAMC', 'GOLDAXIS')
  const tokens = clean.split(/[^A-Z0-9]+/).filter((t) => t.length >= 2 && t.length <= 14);
  for (const t of tokens) {
    if (t.length >= 4 && /^[A-Z0-9]+$/.test(t)) {
      if (!candidates.includes(`${t}.NS`)) candidates.push(`${t}.NS`, `${t}.BO`);
    }
  }

  // Dynamic Yahoo Finance search queries with zero hardcoding
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
    try {
      const searchRes = await fetch(
        `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sq)}&quotesCount=8`,
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

  // Prioritize Indian NSE/BSE symbols
  candidates.sort((a, b) => {
    const aInr = a.endsWith('.NS') || a.endsWith('.BO') || a.endsWith('-INR');
    const bInr = b.endsWith('.NS') || b.endsWith('.BO') || b.endsWith('-INR');
    if (aInr && !bInr) return -1;
    if (!aInr && bInr) return 1;
    return 0;
  });

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

// ──────────────────────────────────────────
// Dedicated Crypto Price Fetcher (CoinGecko + Yahoo Finance)
// ──────────────────────────────────────────

/**
 * Dynamically resolves a crypto name/ticker to a CoinGecko coin ID.
 * Uses CoinGecko's search API — zero hardcoded coin maps.
 */
async function resolveCoinGeckoId(nameOrTicker: string): Promise<string | null> {
  const clean = nameOrTicker.trim().toLowerCase()
    .replace(/\s*(coin|token|crypto|currency|inr|usd|usdt)\s*/gi, '')
    .trim();

  if (!clean || clean.length < 2) return null;

  try {
    const searchRes = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(clean)}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!searchRes.ok) return null;
    const data: any = await searchRes.json();
    const coins = data?.coins;
    if (!coins || coins.length === 0) return null;

    // Find best match: exact symbol or name match first
    const upperClean = clean.toUpperCase();
    const exact = coins.find((c: any) =>
      c.symbol?.toUpperCase() === upperClean ||
      c.name?.toLowerCase() === clean
    );
    return exact?.id || coins[0]?.id || null;
  } catch {
    return null;
  }
}

async function fetchCryptoPrice(
  name: string
): Promise<{ price: number; prevClose?: number; symbol?: string } | null> {
  // 1. Try CoinGecko (most reliable for crypto INR prices)
  const coinId = await resolveCoinGeckoId(name);
  if (coinId) {
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=inr&include_24hr_change=true`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (res.ok) {
        const data: any = await res.json();
        const coinData = data?.[coinId];
        if (coinData && typeof coinData.inr === 'number' && coinData.inr > 0) {
          const price = coinData.inr;
          const changePct = coinData.inr_24h_change || 0;
          const prevClose = changePct !== 0 ? price / (1 + changePct / 100) : undefined;
          return { price, prevClose, symbol: coinId.toUpperCase() };
        }
      }
    } catch {}
  }

  // 2. Fallback: Yahoo Finance with explicit crypto pair symbols
  const clean = name.trim().toUpperCase().replace(/\s*\b(COIN|TOKEN|CRYPTO|CURRENCY)\b\s*/gi, '').trim();
  const tokens = clean.split(/[^A-Z0-9]+/).filter((t) => t.length >= 2 && t.length <= 10);

  const CRYPTO_ALIASES: Record<string, string> = {
    BITCOIN: 'BTC',
    ETHEREUM: 'ETH',
    SOLANA: 'SOL',
    RIPPLE: 'XRP',
    CARDANO: 'ADA',
    DOGECOIN: 'DOGE',
  };

  // Build Yahoo-style crypto candidates
  const candidates: string[] = [];
  for (const t of tokens) {
    if (t === 'INR' || t === 'USD' || t === 'USDT') continue;
    const ticker = CRYPTO_ALIASES[t] || t;
    if (!candidates.includes(`${ticker}-INR`)) candidates.push(`${ticker}-INR`);
    if (!candidates.includes(`${ticker}-USD`)) candidates.push(`${ticker}-USD`);
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
        let price = meta.regularMarketPrice;
        if (sym.endsWith('-USD')) {
          price = price * 87.5; // Approximate conversion if only USD pair is available
        }
        const change = typeof meta.fulldayChange === 'number' ? meta.fulldayChange : typeof meta.regularMarketChange === 'number' ? meta.regularMarketChange : undefined;
        const prevClose = change !== undefined ? price - change : (meta.previousClose || meta.chartPreviousClose);
        return {
          price,
          prevClose,
          symbol: sym,
        };
      }
    } catch {}
  }

  return null;
}

function parseMfNavDate(dateStr: string): Date | null {
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

function scoreMfCandidate(item: { schemeCode: number; schemeName: string }, rawQuery: string): number {
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

  if (sLower === qLower) score += 150;
  else if (sLower.includes(qLower)) score += 60;
  else if (qLower.includes(sLower) && sLower.length >= 8) score += 45;

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

  // Penalize every unexplained extra word (e.g. "Opportunities", "Series", "XL")
  // so the exact-name scheme always beats a fuzzy sibling with the same tokens.
  const matched = new Set<string>();
  for (const qt of qTokens) {
    for (const st of sTokens) {
      if (st.includes(qt) || qt.includes(st)) matched.add(st);
    }
  }
  for (const st of sTokens) {
    if (!matched.has(st)) score -= 15;
  }

  // Penalize query tokens that could not be matched at all
  for (const qt of qTokens) {
    let found = false;
    for (const st of sTokens) {
      if (st.includes(qt) || qt.includes(st)) { found = true; break; }
    }
    if (!found) score -= 12;
  }

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

  const isIdcw = /\b(idcw|dividend|payout|reinvestment)\b/i.test(sName);
  const isGrowth = /\bgrowth\b/i.test(sName);
  if (wantsIdcw) {
    if (isIdcw) score += 40;
    if (isGrowth) score -= 20;
  } else {
    if (isGrowth) score += 40;
    if (isIdcw) score -= 60;
  }

  if (/institutional|unclaimed|segregated|bonus/i.test(sName)) {
    score -= 50;
  }

  return score;
}

function schemeNameSimilarity(a: string, b: string): number {
  const stop = new Set(['fund', 'scheme', 'plan', 'option', 'growth', 'direct', 'regular', 'idcw', 'dividend', 'amc', 'mutual', 'the', 'of', 'and']);
  const tok = (s: string): string[] =>
    (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !stop.has(t));
  const ta = tok(a);
  const tb = tok(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.includes(t)) overlap++;
  for (const t of tb) if (ta.includes(t)) overlap++;
  return (2 * overlap) / (ta.length + tb.length);
}

async function fetchMfNav(name: string, notes?: string): Promise<{ nav: number; date?: string; prevNav?: number; schemeName?: string } | null> {
  const combined = `${name} ${notes || ''}`;

  // 1. Direct scheme code check (if 6-digit scheme code embedded in text or notes)
  // ⚠️ Guard: a 6-digit FOLIO number must never be mistaken for a scheme code —
  // the resolved scheme's name is cross-validated before trusting its NAV.
  const codeMatch = combined.match(/\b\d{6}\b/);
  if (codeMatch) {
    try {
      const detailRes = await fetch(`https://api.mfapi.in/mf/${codeMatch[0]}/latest`, { signal: AbortSignal.timeout(4000) });
      if (detailRes.ok) {
        const details: any = await detailRes.json();
        const latest = details?.data?.[0];
        if (latest && latest.nav) {
          const navNum = parseFloat(latest.nav);
          const resolvedName = String(details.meta?.scheme_name || '');
          const sim = resolvedName ? schemeNameSimilarity(name, resolvedName) : 0;
          if (!isNaN(navNum) && navNum > 0 && sim >= 0.35) {
            return {
              nav: navNum,
              date: latest.date || '',
              schemeName: details.meta?.scheme_name || name,
              prevNav: details.data?.[1]?.nav ? parseFloat(details.data[1].nav) : undefined,
            };
          }
        }
      }
    } catch {}
  }

  // 2. Direct ISIN check (e.g. INF200K01QV8 from CAS / broker statement)
  const isinMatch = combined.match(/\b(INF[A-Z0-9]{9})\b/i);
  if (isinMatch) {
    try {
      const isin = isinMatch[1].toUpperCase();
      const masterRes = await fetch('https://api.mfapi.in/mf', { signal: AbortSignal.timeout(4000) });
      if (masterRes.ok) {
        const masterList: any[] = await masterRes.json();
        const found = masterList.find((x) => x.isinGrowth === isin || x.isinDivReinvestment === isin);
        if (found && found.schemeCode) {
          const detailRes = await fetch(`https://api.mfapi.in/mf/${found.schemeCode}/latest`, { signal: AbortSignal.timeout(4000) });
          if (detailRes.ok) {
            const details: any = await detailRes.json();
            const latest = details?.data?.[0];
            if (latest && latest.nav) {
              const navNum = parseFloat(latest.nav);
              if (!isNaN(navNum) && navNum > 0) {
                return {
                  nav: navNum,
                  date: latest.date || '',
                  schemeName: details.meta?.scheme_name || found.schemeName || name,
                  prevNav: details.data?.[1]?.nav ? parseFloat(details.data[1].nav) : undefined,
                };
              }
            }
          }
        }
      }
    } catch {}
  }

  const strippedName = stripBrokerSuffix(name);

  const rawWords = strippedName
    .replace(/^(name\s+of\s+(the\s+)?scheme|scheme\s*name|scheme)\s*[:：]\s*/i, '')
    .replace(/\b(mutual\s*fund|amc|direct|regular|growth|idcw|payout|reinvestment|plan|option)\b/gi, '')
    .replace(/[\.\(\)₹\$\[\]\/\\-]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (rawWords.length === 0) return null;

  const baseQuery = rawWords.join(' ');
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
    rawWords.slice(0, 4).join(' '),
    rawWords.slice(0, 3).join(' '),
    rawWords.slice(0, 2).join(' '),
  ].filter((q): q is string => Boolean(q) && q.length >= 3);

  const uniqueQueries = [...new Set(queries)];
  const candidateMap = new Map<number, { schemeCode: number; schemeName: string; score: number }>();

  for (const query of uniqueQueries) {
    try {
      const searchRes = await fetch(
        `https://api.mfapi.in/mf/search?q=${encodeURIComponent(query)}`,
        { signal: AbortSignal.timeout(3500) }
      );
      if (searchRes.ok) {
        const list: any[] = await searchRes.json();
        if (Array.isArray(list)) {
          for (const item of list) {
            if (!candidateMap.has(item.schemeCode)) {
              const score = scoreMfCandidate(item, strippedName);
              candidateMap.set(item.schemeCode, { ...item, score });
            }
          }
        }
      }
    } catch {}
    const strong = [...candidateMap.values()].filter((c) => c.score >= 70).length;
    if (strong >= 3) break;
  }

  const sortedCandidates = Array.from(candidateMap.values()).sort((a, b) => b.score - a.score);
  if (sortedCandidates.length === 0) return null;

  const topCandidates = sortedCandidates.slice(0, 6);
  const now = Date.now();
  const validResults: { nav: number; date: string; schemeName: string; prevNav?: number; score: number; isDirect: boolean }[] = [];

  for (const candidate of topCandidates) {
    try {
      const detailRes = await fetch(
        `https://api.mfapi.in/mf/${candidate.schemeCode}/latest`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (!detailRes.ok) continue;
      const details: any = await detailRes.json();
      const latest = details?.data?.[0];
      const prev = details?.data?.[1];

      if (latest && latest.nav) {
        const navNum = parseFloat(latest.nav);
        if (isNaN(navNum) || navNum <= 0) continue;

        // Skip discontinued dead schemes older than 60 days
        const navDate = parseMfNavDate(latest.date);
        if (navDate && now - navDate.getTime() > 60 * 24 * 60 * 60 * 1000) {
          continue;
        }

        // Skip candidates whose resolved name diverges sharply from the searched fund
        const resolvedName = String(details.meta?.scheme_name || candidate.schemeName || '');
        if (resolvedName && schemeNameSimilarity(name, resolvedName) < 0.25) {
          continue;
        }

        validResults.push({
          nav: navNum,
          date: latest.date,
          schemeName: resolvedName,
          prevNav: prev ? parseFloat(prev.nav) : undefined,
          score: candidate.score,
          isDirect: /direct/i.test(resolvedName) || /direct/i.test(candidate.schemeName),
        });
      }
    } catch {}
  }

  if (validResults.length === 0) return null;

  // Prefer Direct Plan and highest score, then highest NAV (growth plan)
  validResults.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.isDirect && !b.isDirect) return -1;
    if (!a.isDirect && b.isDirect) return 1;
    return b.nav - a.nav;
  });

  return {
    nav: validResults[0].nav,
    date: validResults[0].date,
    schemeName: validResults[0].schemeName,
    prevNav: validResults[0].prevNav,
  };
}

export const internalListInvestments = internalQuery({
  args: {
    investmentIds: v.optional(v.array(v.id("investments"))),
  },
  handler: async (ctx, args) => {
    if (args.investmentIds && args.investmentIds.length > 0) {
      const results: any[] = [];
      for (const id of args.investmentIds) {
        const item = await ctx.db.get(id);
        if (item) results.push(item);
      }
      return results;
    }
    const userId = await getAuthUserId(ctx);
    if (userId) {
      return await ctx.db.query("investments").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    }
    return await ctx.db.query("investments").collect();
  },
});

export const internalBatchUpdatePrices = internalMutation({
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
    const now = Date.now();
    for (const u of args.updates) {
      const inv = await ctx.db.get(u.id);
      if (inv) {
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

export const syncLiveMarketPrices = action({
  args: {
    investmentIds: v.optional(v.array(v.id("investments"))),
  },
  handler: async (ctx, args) => {
    const allInvestments: any[] = await ctx.runQuery(
      internal.investments.internalListInvestments,
      { investmentIds: args.investmentIds }
    );
    if (!allInvestments || allInvestments.length === 0) {
      return { success: true, count: 0, updates: [] };
    }

    const updates: { id: any; currentValue: number; currentPrice?: number }[] = [];

    for (const inv of allInvestments) {
      try {
        // ── Asset types with a real, tradable per-unit market price ──
        // FD/RD, PPF/EPF, Real Estate and unlisted "Other" assets have NO live
        // ticker — running a Yahoo/AMFI lookup on their names can return a
        // random unrelated quote and corrupt their stored current value.
        const at = inv.assetType || "";
        if (at === "fd_rd" || at === "ppf_epf" || at === "real_estate" || at === "other") {
          continue;
        }

        let livePrice: number | null = null;

        if (at === "mutual_fund") {
          const mf = await fetchMfNav(inv.name, inv.notes);
          if (mf && mf.nav > 0) {
            livePrice = mf.nav;
          } else if (/\b(etf|bees)\b/i.test(inv.name)) {
            // ONLY check stock/ETF quote if explicitly an ETF or BEES instrument
            const stk = await fetchStockQuote(inv.name);
            if (stk && stk.price > 0) livePrice = stk.price;
          }
        } else if (at === "crypto") {
          const cry = await fetchCryptoPrice(inv.name);
          if (cry && cry.price > 0) {
            livePrice = cry.price;
          }
        } else if (at === "gold") {
          // Exclude SGB (Sovereign Gold Bonds) and unlisted digital gold from taking live exchange/fund prices
          const isSgbOrDigital = /\b(sgb|sovereign|bond|digi|digital)\b/i.test(inv.name);
          if (!isSgbOrDigital) {
            // 1. Try stock quote first for traded ETFs / tickers (e.g. GOLDBEES, SILVERBEES, AXISAMC-GOLDAXIS, ICICIPRAMC - ICICISILVE)
            const stk = await fetchStockQuote(inv.name);
            if (stk && stk.price > 0) {
              livePrice = stk.price;
            } else {
              // 2. Try AMFI NAV for Gold/Silver mutual funds (e.g. SBI Gold Fund, HDFC Silver Fund)
              const mf = await fetchMfNav(inv.name, inv.notes);
              if (mf && mf.nav > 0) {
                livePrice = mf.nav;
              }
            }
          }
        } else {
          // Stocks & listed equity-ish instruments
          const stk = await fetchStockQuote(inv.name);
          if (stk && stk.price > 0) livePrice = stk.price;
        }

        if (livePrice !== null && livePrice > 0) {
          // A price alone is useless without a quantity/price basis — never write
          // the raw per-unit price directly as the holding's total current value.
          const hasQty = inv.units && inv.units > 0;
          const hasBuyBasis = inv.investedAmount > 0 && inv.buyPrice && inv.buyPrice > 0;
          const hasPriceRatio = inv.currentPrice && inv.currentPrice > 0 && inv.currentValue > 0;
          if (!hasQty && !hasBuyBasis && !hasPriceRatio) {
            continue;
          }

          let updatedVal = inv.currentValue;

          if (hasQty) {
            updatedVal = Math.round(inv.units * livePrice * 100) / 100;
          } else if (hasBuyBasis) {
            const derivedUnits = inv.investedAmount / inv.buyPrice;
            updatedVal = Math.round(derivedUnits * livePrice * 100) / 100;
          } else if (hasPriceRatio) {
            const ratio = livePrice / inv.currentPrice;
            updatedVal = Math.round(inv.currentValue * ratio * 100) / 100;
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
      await ctx.runMutation(internal.investments.internalBatchUpdatePrices, { updates });
    }

    return { success: true, count: updates.length, updates };
  },
});

export const fetchLivePrice = action({
  args: {
    name: v.string(),
    assetType: v.string(),
  },
  handler: async (_ctx, args) => {
    const { name, assetType } = args;
    if (!name || name.trim().length < 2) return null;

    if (assetType === "mutual_fund") {
      const mf = await fetchMfNav(name);
      if (mf && mf.nav > 0) {
        return { price: mf.nav, symbol: mf.schemeName, date: mf.date, prevClose: mf.prevNav };
      }
      if (/\b(etf|bees)\b/i.test(name)) {
        return await fetchStockQuote(name);
      }
      return null;
    }

    if (assetType === "crypto") {
      return await fetchCryptoPrice(name);
    }

    if (assetType === "gold") {
      const isSgbOrDigital = /\b(sgb|sovereign|bond|digi|digital)\b/i.test(name);
      if (!isSgbOrDigital) {
        // 1. Try stock quote first for ETFs (GOLDBEES, SILVERBEES, GOLDAXIS, SILVERIETF, etc.)
        const stk = await fetchStockQuote(name);
        if (stk && stk.price > 0) return stk;

        // 2. Try AMFI NAV for Gold/Silver mutual funds
        const mf = await fetchMfNav(name);
        if (mf && mf.nav > 0) {
          return { price: mf.nav, symbol: mf.schemeName, date: mf.date, prevClose: mf.prevNav };
        }
      }
      return null;
    }

    // Stocks, SGBs, Commodities
    return await fetchStockQuote(name);
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
      const key = getHoldingDedupeKey(holding.name, holding.notes);

      let matchKey: string | null = null;
      if (seenMap.has(key)) {
        matchKey = key;
      } else {
        for (const [k, v] of seenMap.entries()) {
          if (areHoldingsEquivalent(v, holding)) {
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
