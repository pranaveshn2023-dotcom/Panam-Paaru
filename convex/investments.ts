import { query, mutation, action, internalQuery, internalMutation, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const STANDARD_HEADERS: Record<string, string> = {
  "User-Agent": DESKTOP_USER_AGENT,
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

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

export function extractStockIsin(text?: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/\b(INE[A-Z0-9]{9})\b/i);
  return m ? m[1].toUpperCase() : undefined;
}

export function extractSecurityIsin(text?: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/\b(IN[A-Z0-9]{10})\b/i);
  return m ? m[1].toUpperCase() : undefined;
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

function getHoldingDedupeKey(name: string, notes?: string, isin?: string, schemeCode?: number): string {
  if (isin) return `isin_${isin.toUpperCase()}`;
  const extractedIsin = extractSecurityIsin(notes) || extractSecurityIsin(name);
  if (extractedIsin) return `isin_${extractedIsin}`;
  if (schemeCode && schemeCode > 0) return `scheme_${schemeCode}`;
  const folio = extractFolio(notes) || extractFolio(name);
  const nameKey = normalizeAssetKey(name) || name.trim().toLowerCase();
  return folio ? `${nameKey}_f_${folio}` : `n_${nameKey}`;
}

function areHoldingsEquivalent(
  a: { name: string; notes?: string; isin?: string; schemeCode?: number },
  b: { name: string; notes?: string; isin?: string; schemeCode?: number }
): boolean {
  // 1. ISIN equivalence: 100% unique primary mapping key across all Indian NSE/BSE stocks & mutual funds
  const aIsin = a.isin || extractSecurityIsin(a.notes) || extractSecurityIsin(a.name);
  const bIsin = b.isin || extractSecurityIsin(b.notes) || extractSecurityIsin(b.name);
  if (aIsin && bIsin) {
    return aIsin === bIsin;
  }

  // 2. AMFI Scheme Code equivalence: 100% unique primary key for Indian mutual funds
  if (a.schemeCode && b.schemeCode && a.schemeCode > 0 && b.schemeCode > 0) {
    return a.schemeCode === b.schemeCode;
  }

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

    // Cleanly normalize all user investments without dropping distinct holdings
    const uniqueInvestments = investments;

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

    const uniqueInvestments = investments;

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

      const invAmt = typeof rawInv.investedAmount === "number" && !isNaN(rawInv.investedAmount) ? Math.max(0, rawInv.investedAmount) : 0;
      const curVal = typeof rawInv.currentValue === "number" && !isNaN(rawInv.currentValue) ? Math.max(0, rawInv.currentValue) : 0;
      const sip = typeof rawInv.sipAmount === "number" && !isNaN(rawInv.sipAmount) ? Math.max(0, rawInv.sipAmount) : 0;

      totalInvested += invAmt;
      totalCurrentValue += curVal;
      totalMonthlySip += sip;

      if (!assetAllocationMap[assetType]) {
        assetAllocationMap[assetType] = { invested: 0, current: 0, count: 0 };
      }
      assetAllocationMap[assetType].invested += invAmt;
      assetAllocationMap[assetType].current += curVal;
      assetAllocationMap[assetType].count += 1;
    }

    totalInvested = Math.round(totalInvested * 100) / 100;
    totalCurrentValue = Math.round(totalCurrentValue * 100) / 100;
    totalMonthlySip = Math.round(totalMonthlySip * 100) / 100;
    const totalReturnsAmount = Math.round((totalCurrentValue - totalInvested) * 100) / 100;
    const totalReturnsPercent =
      totalInvested > 0
        ? Number(((totalReturnsAmount / totalInvested) * 100).toFixed(2))
        : 0;

    const assetBreakdown = Object.entries(assetAllocationMap).map(([type, data]) => ({
      assetType: type,
      investedAmount: Math.round(data.invested * 100) / 100,
      currentValue: Math.round(data.current * 100) / 100,
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
    schemeCode: v.optional(v.number()),
    isin: v.optional(v.string()),
    ticker: v.optional(v.string()),
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

    const combinedNotes = `${args.name} ${args.notes || ''}`;
    const autoIsin = args.isin || extractStockIsin(combinedNotes) || extractSecurityIsin(combinedNotes);
    const withoutFolio = combinedNotes.replace(/\b(?:folio|folio\s*no|folio\s*number|ac\s*no|account|acc)\s*[:#-]?\s*[\w\/-]+/gi, '');
    const explicitSchemeMatch = withoutFolio.match(/\b(?:scheme\s*code|amfi\s*code|amfi)\s*[:#-]?\s*(\d{6})\b/i);
    const autoSchemeCode = args.schemeCode || (explicitSchemeMatch ? parseInt(explicitSchemeMatch[1], 10) : undefined);

    const userInvestments = await ctx.db
      .query("investments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const matched = userInvestments.find(
      (inv) => areHoldingsEquivalent(inv, { name: args.name, notes: args.notes, isin: autoIsin, schemeCode: autoSchemeCode })
    );

    if (matched) {
      const existingUnits = matched.units || 0;
      const addedUnits = args.units || 0;
      const combinedUnits = existingUnits + addedUnits > 0 ? existingUnits + addedUnits : undefined;
      const combinedInvested = matched.investedAmount + Math.max(0, args.investedAmount);
      const combinedValue = matched.currentValue + Math.max(0, args.currentValue);
      const newAvgBuyPrice =
        combinedUnits && combinedUnits > 0
          ? Math.round((combinedInvested / combinedUnits) * 10000) / 10000
          : derivedBuyPrice;

      await ctx.db.patch(matched._id, {
        investedAmount: combinedInvested,
        currentValue: combinedValue,
        units: combinedUnits,
        buyPrice: newAvgBuyPrice,
        currentPrice: derivedCurrentPrice ?? matched.currentPrice,
        schemeCode: autoSchemeCode ?? matched.schemeCode,
        isin: autoIsin ?? matched.isin,
        ticker: args.ticker ?? matched.ticker,
        sipAmount: args.sipAmount ?? matched.sipAmount,
        sipDay: args.sipDay ?? matched.sipDay,
        updatedAt: Date.now(),
      });
      return matched._id;
    }

    const id = await ctx.db.insert("investments", {
      userId,
      name: args.name.trim(),
      assetType: args.assetType,
      investedAmount: Math.max(0, args.investedAmount),
      currentValue: Math.max(0, args.currentValue),
      units: args.units,
      buyPrice: derivedBuyPrice,
      currentPrice: derivedCurrentPrice,
      schemeCode: autoSchemeCode,
      isin: autoIsin,
      ticker: args.ticker,
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
        schemeCode: v.optional(v.number()),
        isin: v.optional(v.string()),
        ticker: v.optional(v.string()),
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

      const combined = `${item.name} ${item.notes || ''}`;
      const autoIsin = item.isin || extractStockIsin(combined) || extractSecurityIsin(combined);
      const withoutFolio = combined.replace(/\b(?:folio|folio\s*no|folio\s*number|ac\s*no|account|acc)\s*[:#-]?\s*[\w\/-]+/gi, '');
      const explicitSchemeMatch = withoutFolio.match(/\b(?:scheme\s*code|amfi\s*code|amfi)\s*[:#-]?\s*(\d{6})\b/i);
      const autoSchemeCode = item.schemeCode || (explicitSchemeMatch ? parseInt(explicitSchemeMatch[1], 10) : undefined);

      // Find matching existing holding by ISIN, schemeCode, or name equivalence
      const matchIndex = existingHoldings.findIndex((ex) =>
        areHoldingsEquivalent(ex, { ...item, isin: autoIsin, schemeCode: autoSchemeCode })
      );

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
          (item.xirr && existing.xirr !== item.xirr) ||
          (autoIsin && existing.isin !== autoIsin) ||
          (autoSchemeCode && existing.schemeCode !== autoSchemeCode) ||
          (item.ticker && existing.ticker !== item.ticker);

        if (hasChanges) {
          // Overwrite existing holding with new values from updated statement
          await ctx.db.patch(existing._id, {
            name: item.name.trim(),
            currentValue: Math.max(0, item.currentValue),
            investedAmount: item.investedAmount > 0 ? item.investedAmount : existing.investedAmount,
            units: item.units !== undefined ? item.units : existing.units,
            currentPrice: derivedCurrentPrice !== undefined ? derivedCurrentPrice : existing.currentPrice,
            buyPrice: derivedBuyPrice !== undefined ? derivedBuyPrice : existing.buyPrice,
            schemeCode: autoSchemeCode ?? existing.schemeCode,
            isin: autoIsin ?? existing.isin,
            ticker: item.ticker ?? existing.ticker,
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
            schemeCode: autoSchemeCode ?? existing.schemeCode,
            isin: autoIsin ?? existing.isin,
            ticker: item.ticker ?? existing.ticker,
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
          schemeCode: autoSchemeCode,
          isin: autoIsin,
          ticker: item.ticker,
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
          schemeCode: autoSchemeCode,
          isin: autoIsin,
          ticker: item.ticker,
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
        schemeCode: v.optional(v.number()),
        isin: v.optional(v.string()),
        ticker: v.optional(v.string()),
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
          schemeCode: u.schemeCode ?? inv.schemeCode,
          isin: u.isin ?? inv.isin,
          ticker: u.ticker ?? inv.ticker,
          updatedAt: now,
        });

        // Sync to cache so cache DB has the newest verified quote
        const price = u.currentPrice ?? inv.currentPrice;
        if (price && price > 0) {
          const isin = u.isin ?? inv.isin;
          if (inv.assetType === "mutual_fund" || (inv.assetType === "gold" && /fund/i.test(inv.name))) {
            const cleanKey = normalizeMfSearchKey(inv.name);
            const schemeCode = u.schemeCode ?? inv.schemeCode ?? 0;
            const existingCache = isin
              ? await ctx.db.query("mfNavCache").withIndex("by_isin", (q) => q.eq("isin", isin)).first()
              : schemeCode > 0
                ? await ctx.db.query("mfNavCache").withIndex("by_scheme_code", (q) => q.eq("schemeCode", schemeCode)).first()
                : await ctx.db.query("mfNavCache").withIndex("by_search_key", (q) => q.eq("searchKey", cleanKey)).first();
            if (existingCache) {
              await ctx.db.patch(existingCache._id, { nav: price, lastFetchedAt: now });
            } else {
              await ctx.db.insert("mfNavCache", {
                schemeCode,
                schemeName: inv.name,
                nav: price,
                navDate: getLatestExpectedMfNavDate(),
                searchKey: cleanKey,
                isin,
                lastFetchedAt: now,
              });
            }
          } else {
            const searchKey = normalizeStockSearchKey(inv.name);
            const symbol = u.ticker ?? inv.ticker ?? inv.name.trim().toUpperCase();
            const existingCache = isin
              ? await ctx.db.query("stockPriceCache").withIndex("by_isin", (q) => q.eq("isin", isin)).first()
              : await ctx.db.query("stockPriceCache").withIndex("by_symbol", (q) => q.eq("symbol", symbol)).first();
            if (existingCache) {
              await ctx.db.patch(existingCache._id, { price, lastFetchedAt: now });
            } else {
              await ctx.db.insert("stockPriceCache", {
                isin,
                symbol,
                name: inv.name,
                price,
                searchKey,
                lastFetchedAt: now,
              });
            }
          }
        }
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
    schemeCode: v.optional(v.number()),
    isin: v.optional(v.string()),
    ticker: v.optional(v.string()),
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

    const combinedNotes = `${args.name} ${args.notes || ''}`;
    const autoIsin = args.isin || existing.isin || extractStockIsin(combinedNotes) || extractSecurityIsin(combinedNotes);
    const withoutFolio = combinedNotes.replace(/\b(?:folio|folio\s*no|folio\s*number|ac\s*no|account|acc)\s*[:#-]?\s*[\w\/-]+/gi, '');
    const explicitSchemeMatch = withoutFolio.match(/\b(?:scheme\s*code|amfi\s*code|amfi)\s*[:#-]?\s*(\d{6})\b/i);
    const autoSchemeCode = args.schemeCode ?? existing.schemeCode ?? (explicitSchemeMatch ? parseInt(explicitSchemeMatch[1], 10) : undefined);

    let resolvedPrice = args.currentPrice ?? existing.currentPrice;
    let resolvedValue = args.currentValue;

    // Mathematical reconciliation:
    // If units and price are present, keep value = units * price
    if (args.units && args.units > 0 && resolvedPrice && resolvedPrice > 0) {
      resolvedValue = Math.round(args.units * resolvedPrice * 100) / 100;
    } else if (resolvedValue > 0 && args.units && args.units > 0 && (!resolvedPrice || resolvedPrice <= 0)) {
      resolvedPrice = Math.round((resolvedValue / args.units) * 100) / 100;
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      assetType: args.assetType,
      investedAmount: Math.max(0, args.investedAmount),
      currentValue: Math.max(0, resolvedValue),
      units: args.units,
      buyPrice: args.buyPrice,
      currentPrice: resolvedPrice,
      schemeCode: autoSchemeCode,
      isin: autoIsin,
      ticker: args.ticker ?? existing.ticker,
      sipAmount: args.sipAmount,
      sipDay: args.sipDay,
      xirr: args.xirr,
      notes: args.notes,
      manualPrice: Boolean(resolvedPrice && resolvedPrice > 0),
      updatedAt: now,
    });

    // CRITICAL: Synchronize cache DB with the user's manual correction
    if (resolvedPrice && resolvedPrice > 0) {
      if (args.assetType === "mutual_fund" || (args.assetType === "gold" && /fund/i.test(args.name))) {
        const cleanKey = normalizeMfSearchKey(args.name);
        const schemeCode = autoSchemeCode || 0;
        const existingCache = autoIsin
          ? await ctx.db.query("mfNavCache").withIndex("by_isin", (q) => q.eq("isin", autoIsin)).first()
          : schemeCode > 0
            ? await ctx.db.query("mfNavCache").withIndex("by_scheme_code", (q) => q.eq("schemeCode", schemeCode)).first()
            : await ctx.db.query("mfNavCache").withIndex("by_search_key", (q) => q.eq("searchKey", cleanKey)).first();
        if (existingCache) {
          await ctx.db.patch(existingCache._id, {
            nav: resolvedPrice,
            schemeCode: schemeCode > 0 ? schemeCode : existingCache.schemeCode,
            schemeName: args.name.trim(),
            lastFetchedAt: now,
          });
        } else {
          await ctx.db.insert("mfNavCache", {
            schemeCode,
            schemeName: args.name.trim(),
            nav: resolvedPrice,
            navDate: getLatestExpectedMfNavDate(),
            searchKey: cleanKey,
            isin: autoIsin,
            lastFetchedAt: now,
          });
        }
      } else {
        const searchKey = normalizeStockSearchKey(args.name);
        const symbol = args.ticker ?? existing.ticker ?? args.name.trim().toUpperCase();
        const existingCache = autoIsin
          ? await ctx.db.query("stockPriceCache").withIndex("by_isin", (q) => q.eq("isin", autoIsin)).first()
          : await ctx.db.query("stockPriceCache").withIndex("by_symbol", (q) => q.eq("symbol", symbol)).first();
        if (existingCache) {
          await ctx.db.patch(existingCache._id, { price: resolvedPrice, lastFetchedAt: now });
        } else {
          await ctx.db.insert("stockPriceCache", {
            isin: autoIsin,
            symbol,
            name: args.name.trim(),
            price: resolvedPrice,
            searchKey,
            lastFetchedAt: now,
          });
        }
      }
    }

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

    let resolvedPrice = args.currentPrice ?? existing.currentPrice;
    let resolvedValue = args.currentValue;

    // Mathematical reconciliation:
    // If units and price are passed, calculate currentValue = units * price
    if (args.currentPrice && args.currentPrice > 0 && existing.units && existing.units > 0) {
      resolvedValue = Math.round(existing.units * args.currentPrice * 100) / 100;
    } else if (resolvedValue > 0 && existing.units && existing.units > 0 && (!resolvedPrice || resolvedPrice <= 0)) {
      resolvedPrice = Math.round((resolvedValue / existing.units) * 100) / 100;
    }

    const now = Date.now();
    const patchData: any = {
      currentValue: Math.max(0, resolvedValue),
      currentPrice: resolvedPrice,
      manualPrice: true,
      manualPriceUpdatedAt: now,
      updatedAt: now,
    };

    if (args.currentPrice && args.currentPrice > 0 && (!existing.units || existing.units <= 0)) {
      patchData.units = Math.round((resolvedValue / args.currentPrice) * 10000) / 10000;
    }

    await ctx.db.patch(args.id, patchData);
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

/**
 * Resolves an Indian stock ISIN (e.g. INE002A01018) to official NSE (.NS) or BSE (.BO) ticker
 * using Yahoo Finance search API with zero hardcoding.
 */
export async function resolveTickerFromIsin(isin: string): Promise<string | null> {
  if (!isin) return null;
  const upper = isin.toUpperCase();

  try {
    let res: Response | null = null;
    try {
      res = await fetch(
        `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(upper)}&quotesCount=6`,
        { headers: STANDARD_HEADERS, signal: AbortSignal.timeout(3500) }
      );
    } catch {
      try {
        res = await fetch(
          `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(upper)}&quotesCount=6`,
          { headers: STANDARD_HEADERS, signal: AbortSignal.timeout(3500) }
        );
      } catch {}
    }
    if (res && res.ok) {
      const data: any = await res.json();
      const quotes: any[] = data?.quotes || [];
      // 1. Direct NSE (.NS) match - primary high-volume Indian exchange
      const nse = quotes.find((q) => q.symbol && q.symbol.toUpperCase().endsWith(".NS"));
      if (nse?.symbol) return nse.symbol.toUpperCase();

      // 2. If BSE (.BO) returned, the dual-listed equity on NSE is TICKER.NS
      const bse = quotes.find((q) => q.symbol && q.symbol.toUpperCase().endsWith(".BO"));
      if (bse?.symbol) {
        const base = bse.symbol.toUpperCase().replace(/\.BO$/, "");
        return `${base}.NS`;
      }

      if (quotes.length > 0 && quotes[0].symbol) {
        return quotes[0].symbol.toUpperCase();
      }
    }
  } catch (err) {
    console.warn(`[YahooSearch] Error resolving ISIN ${upper}:`, err);
  }
  return null;
}

async function fetchStockQuote(
  name: string,
  notes?: string,
  knownIsin?: string,
  knownTicker?: string
): Promise<{ price: number; prevClose?: number; symbol?: string; isin?: string } | null> {
  const combined = `${name} ${notes || ""}`;
  const isin = knownIsin || extractStockIsin(combined) || extractSecurityIsin(combined);
  const candidates: string[] = [];
  const highPriorityCandidates: string[] = [];

  const addCandidate = (sym?: string, highPriority = false) => {
    if (!sym) return;
    const s = sym.trim().toUpperCase();
    if (s.startsWith("^")) return; // Indices (^BSESN, ^NSEI) are market benchmarks, not tradeable equity/ETF holdings
    if (highPriority && !highPriorityCandidates.includes(s)) {
      highPriorityCandidates.push(s);
    }
    if (!candidates.includes(s)) candidates.push(s);
  };

  // 1. If explicit ticker known from holding or notes, prioritize NSE version
  if (knownTicker) {
    const kt = knownTicker.trim().toUpperCase();
    if (kt.endsWith(".BO")) {
      addCandidate(kt.replace(/\.BO$/, ".NS"), true);
    }
    addCandidate(kt, true);
  }

  // 2. Address stock based on unique ISIN: dynamically resolve to Ticker.NS or Ticker.BO via Yahoo Finance search
  if (isin) {
    const resolvedTicker = await resolveTickerFromIsin(isin);
    if (resolvedTicker) {
      if (resolvedTicker.endsWith(".BO")) {
        addCandidate(resolvedTicker.replace(/\.BO$/, ".NS"), true);
      }
      addCandidate(resolvedTicker, true);
    }
  }

  const clean = name.trim().toUpperCase();
  const strippedCorporate = clean
    .replace(/\b(LIMITED|LTD|CORPORATION|CORP|COMPANY|CO|PLC|PVT|PRIVATE)\b\.?/gi, "")
    .trim();

  // If clean is already an explicit ticker with exchange suffix
  if (clean.endsWith(".NS") || clean.endsWith(".BO") || clean.endsWith("-INR") || clean.endsWith("-USD")) {
    addCandidate(clean, true);
  }

  // 3. Dynamic Yahoo Finance Search: Universal resolution for ANY stock, ETF, or fund
  const searchQueries: string[] = [];
  if (clean) searchQueries.push(clean);
  if (strippedCorporate && strippedCorporate !== clean && strippedCorporate.length >= 3) {
    searchQueries.push(strippedCorporate);
  }
  const simplified = clean
    .replace(/[-_]/g, " ")
    .replace(/\b(AMC|ETF|FUND|INDEX|GROWTH|DIRECT|REGULAR|OPTION|PLAN)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (simplified && simplified !== clean && simplified.length >= 3) {
    searchQueries.push(simplified);
  }

  const tokens = clean.split(/[^A-Z0-9]+/).filter((t) => t.length >= 2 && t.length <= 14);
  const lastToken = tokens[tokens.length - 1];
  if (lastToken && lastToken.length >= 4 && !searchQueries.includes(lastToken)) {
    searchQueries.push(lastToken);
  }

  for (const sq of searchQueries) {
    try {
      let searchRes: Response | null = null;
      try {
        searchRes = await fetch(
          `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sq)}&quotesCount=8`,
          { headers: STANDARD_HEADERS, signal: AbortSignal.timeout(3500) }
        );
      } catch {
        try {
          searchRes = await fetch(
            `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sq)}&quotesCount=8`,
            { headers: STANDARD_HEADERS, signal: AbortSignal.timeout(3500) }
          );
        } catch {}
      }
      if (searchRes && searchRes.ok) {
        const data: any = await searchRes.json();
        for (const q of data?.quotes || []) {
          if (!q.symbol || q.symbol.includes("=F") || q.symbol.startsWith("^")) continue;
          const sym = q.symbol.toUpperCase();
          if (sym.endsWith(".BO")) {
            addCandidate(sym.replace(/\.BO$/, ".NS"), true);
          }
          addCandidate(sym, true);
        }
      }
    } catch { }
  }

  // 4. Direct bare ticker match if single word / short identifier
  if (/^[A-Z0-9]{1,14}$/.test(clean)) {
    addCandidate(`${clean}.NS`);
    addCandidate(`${clean}.BO`);
    addCandidate(clean);
  }
  const compact = strippedCorporate.replace(/[^A-Z0-9]/g, "");
  if (compact.length >= 2 && compact.length <= 14) {
    addCandidate(`${compact}.NS`);
    addCandidate(`${compact}.BO`);
  }

  // 5. Fallback tokens only if no candidates found yet
  if (candidates.length === 0) {
    for (const t of tokens) {
      if (t.length >= 4 && /^[A-Z0-9]+$/.test(t)) {
        addCandidate(`${t}.NS`);
        addCandidate(`${t}.BO`);
      }
    }
  }

  // Strict priority: High priority search matches first, with NSE (.NS) prioritized over BSE (.BO)
  candidates.sort((a, b) => {
    const aHigh = highPriorityCandidates.includes(a);
    const bHigh = highPriorityCandidates.includes(b);
    if (aHigh && !bHigh) return -1;
    if (!aHigh && bHigh) return 1;

    const aNse = a.endsWith(".NS");
    const bNse = b.endsWith(".NS");
    if (aNse && !bNse) return -1;
    if (!aNse && bNse) return 1;

    const aBse = a.endsWith(".BO");
    const bBse = b.endsWith(".BO");
    if (aBse && !bBse) return -1;
    if (!aBse && bBse) return 1;

    return 0;
  });

  // Make live price API call to existing Yahoo Finance chart endpoint using resolved ticker
  for (const sym of candidates) {
    try {
      let chartRes = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}`,
        { headers: STANDARD_HEADERS, signal: AbortSignal.timeout(4000) }
      );
      if (!chartRes.ok) {
        chartRes = await fetch(
          `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}`,
          { headers: STANDARD_HEADERS, signal: AbortSignal.timeout(4000) }
        );
      }
      if (!chartRes.ok) continue;
      const data: any = await chartRes.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta && typeof meta.regularMarketPrice === "number" && meta.regularMarketPrice > 0) {
        let price = meta.regularMarketPrice;
        let change =
          typeof meta.fulldayChange === "number"
            ? meta.fulldayChange
            : typeof meta.regularMarketChange === "number"
              ? meta.regularMarketChange
              : undefined;

        if (meta.currency === "USD") {
          const usdInr = await fetchLiveUsdInrRate();
          price = Math.round(price * usdInr * 100) / 100;
          if (change !== undefined) {
            change = Math.round(change * usdInr * 100) / 100;
          }
        }

        const prevClose =
          change !== undefined
            ? price - change
            : meta.previousClose || meta.chartPreviousClose;
        return {
          price,
          prevClose,
          symbol: sym,
          isin: isin || undefined,
        };
      }
    } catch { }
  }

  return null;
}

// ──────────────────────────────────────────
// Dedicated Crypto Price Fetcher (CoinGecko + Yahoo Finance)
// ──────────────────────────────────────────

/**
 * Dynamically resolves a crypto name/ticker to its CoinGecko ID and ticker symbol.
 * Uses CoinGecko's search API — zero hardcoded coin maps.
 */
// ──────────────────────────────────────────
// High-Accuracy Crypto Price Engine
// ──────────────────────────────────────────

const STATIC_CRYPTO_MAP: Record<string, { symbol: string; coinId: string }> = {
  bitcoin: { symbol: 'BTC', coinId: 'bitcoin' },
  btc: { symbol: 'BTC', coinId: 'bitcoin' },
  ethereum: { symbol: 'ETH', coinId: 'ethereum' },
  eth: { symbol: 'ETH', coinId: 'ethereum' },
  solana: { symbol: 'SOL', coinId: 'solana' },
  sol: { symbol: 'SOL', coinId: 'solana' },
  ripple: { symbol: 'XRP', coinId: 'ripple' },
  xrp: { symbol: 'XRP', coinId: 'ripple' },
  cardano: { symbol: 'ADA', coinId: 'cardano' },
  ada: { symbol: 'ADA', coinId: 'cardano' },
  dogecoin: { symbol: 'DOGE', coinId: 'dogecoin' },
  doge: { symbol: 'DOGE', coinId: 'dogecoin' },
  tether: { symbol: 'USDT', coinId: 'tether' },
  usdt: { symbol: 'USDT', coinId: 'tether' },
  'usd coin': { symbol: 'USDC', coinId: 'usd-coin' },
  usdc: { symbol: 'USDC', coinId: 'usd-coin' },
  binance: { symbol: 'BNB', coinId: 'binancecoin' },
  'binance coin': { symbol: 'BNB', coinId: 'binancecoin' },
  bnb: { symbol: 'BNB', coinId: 'binancecoin' },
  polygon: { symbol: 'POL', coinId: 'polygon-ecosystem-token' },
  matic: { symbol: 'POL', coinId: 'polygon-ecosystem-token' },
  pol: { symbol: 'POL', coinId: 'polygon-ecosystem-token' },
  avalanche: { symbol: 'AVAX', coinId: 'avalanche-2' },
  avax: { symbol: 'AVAX', coinId: 'avalanche-2' },
  polkadot: { symbol: 'DOT', coinId: 'polkadot' },
  dot: { symbol: 'DOT', coinId: 'polkadot' },
  chainlink: { symbol: 'LINK', coinId: 'chainlink' },
  link: { symbol: 'LINK', coinId: 'chainlink' },
  'shiba inu': { symbol: 'SHIB', coinId: 'shiba-inu' },
  shib: { symbol: 'SHIB', coinId: 'shiba-inu' },
  near: { symbol: 'NEAR', coinId: 'near' },
  litecoin: { symbol: 'LTC', coinId: 'litecoin' },
  ltc: { symbol: 'LTC', coinId: 'litecoin' },
  uniswap: { symbol: 'UNI', coinId: 'uniswap' },
  uni: { symbol: 'UNI', coinId: 'uniswap' },
  tron: { symbol: 'TRX', coinId: 'tron' },
  trx: { symbol: 'TRX', coinId: 'tron' },
  cosmos: { symbol: 'ATOM', coinId: 'cosmos' },
  atom: { symbol: 'ATOM', coinId: 'cosmos' },
  monero: { symbol: 'XMR', coinId: 'monero' },
  xmr: { symbol: 'XMR', coinId: 'monero' },
  kaspa: { symbol: 'KAS', coinId: 'kaspa' },
  kas: { symbol: 'KAS', coinId: 'kaspa' },
  toncoin: { symbol: 'TON', coinId: 'the-open-network' },
  ton: { symbol: 'TON', coinId: 'the-open-network' },
  sui: { symbol: 'SUI', coinId: 'sui' },
  pepe: { symbol: 'PEPE', coinId: 'pepe' },
  arbitrum: { symbol: 'ARB', coinId: 'arbitrum' },
  arb: { symbol: 'ARB', coinId: 'arbitrum' },
  optimism: { symbol: 'OP', coinId: 'optimism' },
  op: { symbol: 'OP', coinId: 'optimism' },
  stellar: { symbol: 'XLM', coinId: 'stellar' },
  xlm: { symbol: 'XLM', coinId: 'stellar' },
  hedera: { symbol: 'HBAR', coinId: 'hedera-hashgraph' },
  hbar: { symbol: 'HBAR', coinId: 'hedera-hashgraph' },
  render: { symbol: 'RENDER', coinId: 'render-token' },
  rndr: { symbol: 'RENDER', coinId: 'render-token' },
  injective: { symbol: 'INJ', coinId: 'injective-protocol' },
  inj: { symbol: 'INJ', coinId: 'injective-protocol' },
  bittensor: { symbol: 'TAO', coinId: 'bittensor' },
  tao: { symbol: 'TAO', coinId: 'bittensor' },
  fantom: { symbol: 'FTM', coinId: 'fantom' },
  ftm: { symbol: 'FTM', coinId: 'fantom' },
  fetch: { symbol: 'FET', coinId: 'fetch-ai' },
  fet: { symbol: 'FET', coinId: 'fetch-ai' },
  aptos: { symbol: 'APT', coinId: 'aptos' },
  apt: { symbol: 'APT', coinId: 'aptos' },
  aave: { symbol: 'AAVE', coinId: 'aave' },
};

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
  shiba: 'shiba inu',
};

async function resolveCryptoMeta(
  nameOrTicker: string
): Promise<{ coinId: string | null; symbol: string | null; candidates: string[] }> {
  if (!nameOrTicker) return { coinId: null, symbol: null, candidates: [] };

  const raw = nameOrTicker.trim().toLowerCase();

  // 1. Direct typo check
  const typoResolved = COMMON_CRYPTO_TYPOS[raw] || raw;

  // 2. Word-boundary cleaning (preserves tokens like 'bitcoin', 'dogecoin', 'litecoin')
  const clean = typoResolved
    .replace(/\b(coin|token|crypto|cryptocurrency|currency)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const candidates: string[] = [];
  const addSym = (s?: string | null) => {
    if (!s) return;
    const upper = s.trim().toUpperCase();
    if (upper.length >= 2 && upper.length <= 14 && !candidates.includes(upper)) {
      candidates.push(upper);
    }
  };

  // If user entered a bare ticker (e.g. BTC, ETH, KAS, SUI, PEPE, WIF, POPCAT, etc.)
  if (/^[a-z0-9]{2,14}$/i.test(clean)) {
    addSym(clean);
  }

  // 3. Instant O(1) static dictionary lookup (fast path for top 100)
  let coinId: string | null = null;
  let resolvedSymbol: string | null = null;

  if (STATIC_CRYPTO_MAP[raw]) {
    resolvedSymbol = STATIC_CRYPTO_MAP[raw].symbol;
    coinId = STATIC_CRYPTO_MAP[raw].coinId;
  } else if (STATIC_CRYPTO_MAP[clean]) {
    resolvedSymbol = STATIC_CRYPTO_MAP[clean].symbol;
    coinId = STATIC_CRYPTO_MAP[clean].coinId;
  } else {
    const compact = clean.replace(/[^a-z0-9]/g, '');
    if (STATIC_CRYPTO_MAP[compact]) {
      resolvedSymbol = STATIC_CRYPTO_MAP[compact].symbol;
      coinId = STATIC_CRYPTO_MAP[compact].coinId;
    }
  }

  if (resolvedSymbol) {
    addSym(resolvedSymbol);
    return { coinId, symbol: resolvedSymbol, candidates };
  }

  if (!clean || clean.length < 2) return { coinId: null, symbol: candidates[0] || null, candidates };

  // 4. Dynamic CoinGecko Search (covers 14,000+ active crypto tokens)
  try {
    const searchRes = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(clean)}`,
      { signal: AbortSignal.timeout(3500) }
    );
    if (searchRes.ok) {
      const data: any = await searchRes.json();
      const coins = data?.coins;
      if (coins && coins.length > 0) {
        const upperClean = clean.toUpperCase();
        const exact = coins.find((c: any) =>
          c.symbol?.toUpperCase() === upperClean ||
          c.name?.toLowerCase() === clean
        );
        const chosen = exact || coins[0];
        if (chosen?.symbol) {
          coinId = chosen.id || null;
          resolvedSymbol = chosen.symbol.toUpperCase();
          addSym(resolvedSymbol);
        }
      }
    }
  } catch { }

  // 5. Dynamic Yahoo Finance Search (universal resolution for any global crypto token)
  // Resolves full names like "dogwifhat", "decentraland", "thorchain", "vechain" -> "WIF", "MANA", "RUNE", "VET"
  try {
    const ySearchRes = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(clean)}&quotesCount=6`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(3500) }
    );
    if (ySearchRes.ok) {
      const yData: any = await ySearchRes.json();
      const quotes = yData?.quotes || [];
      const cryptoQuote = quotes.find((q: any) =>
        q.quoteType === 'CRYPTOCURRENCY' ||
        (q.symbol && (q.symbol.endsWith('-USD') || q.symbol.endsWith('-INR')))
      );
      if (cryptoQuote?.symbol) {
        const base = cryptoQuote.symbol.replace(/-(USD|INR)$/, '').toUpperCase();
        addSym(base);
        if (!resolvedSymbol) resolvedSymbol = base;
      }
    }
  } catch { }

  addSym(clean);

  return {
    coinId,
    symbol: resolvedSymbol || candidates[0] || clean.toUpperCase(),
    candidates,
  };
}

let lastKnownLiveUsdInrRate: number | null = null;
let lastUsdInrFetchedAt = 0;

async function fetchLiveUsdInrRate(): Promise<number> {
  const now = Date.now();
  if (lastKnownLiveUsdInrRate !== null && now - lastUsdInrFetchedAt < 10 * 60 * 1000) {
    return lastKnownLiveUsdInrRate;
  }

  // 1. Primary: Yahoo Finance live forex spot USDINR=X
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/USDINR=X', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data: any = await res.json();
      const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (typeof rate === 'number' && rate > 0) {
        lastKnownLiveUsdInrRate = rate;
        lastUsdInrFetchedAt = now;
        return rate;
      }
    }
  } catch { }

  // 2. Secondary: Open Exchange Rates public live feed
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data: any = await res.json();
      const rate = data?.rates?.INR;
      if (typeof rate === 'number' && rate > 0) {
        lastKnownLiveUsdInrRate = rate;
        lastUsdInrFetchedAt = now;
        return rate;
      }
    }
  } catch { }

  // 3. Tertiary: Frankfurter European Central Bank live reference exchange rate
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=INR', {
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data: any = await res.json();
      const rate = data?.rates?.INR;
      if (typeof rate === 'number' && rate > 0) {
        lastKnownLiveUsdInrRate = rate;
        lastUsdInrFetchedAt = now;
        return rate;
      }
    }
  } catch { }

  // 4. In-memory session cache: uses last verified live rate fetched from market
  if (lastKnownLiveUsdInrRate !== null && lastKnownLiveUsdInrRate > 0) {
    return lastKnownLiveUsdInrRate;
  }

  // 5. Offline initial fallback matching current market forex rate
  return 95.8;
}

async function fetchCryptoPrice(
  name: string
): Promise<{ price: number; prevClose?: number; symbol?: string } | null> {
  const { coinId, symbol, candidates } = await resolveCryptoMeta(name);
  const targets: string[] = [];
  if (symbol && !targets.includes(symbol)) targets.push(symbol);
  for (const c of candidates) {
    if (!targets.includes(c)) targets.push(c);
  }
  if (targets.length === 0) targets.push(name.trim().toUpperCase());

  for (const targetSymbol of targets.slice(0, 3)) {
    // ── Tier 1: Yahoo Finance Direct -INR Crypto Pair ──
    // Matches official universal Indian Rupee spot rates (CoinMarketCap, Google Finance)
    try {
      const yRes = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(targetSymbol)}-INR`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(3500) }
      );
      if (yRes.ok) {
        const d: any = await yRes.json();
        const meta = d?.chart?.result?.[0]?.meta;
        if (meta && typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0) {
          const price = meta.regularMarketPrice;
          const change =
            typeof meta.fulldayChange === 'number'
              ? meta.fulldayChange
              : typeof meta.regularMarketChange === 'number'
              ? meta.regularMarketChange
              : undefined;
          const prevClose = change !== undefined ? price - change : (meta.previousClose || meta.chartPreviousClose);
          return { price, prevClose, symbol: `${targetSymbol}-INR` };
        }
      }
    } catch { }

    // ── Tier 2: Binance Global Spot API (24hr Ticker) ──
    // World's #1 most liquid cryptocurrency market — ultra low latency, zero rate limits
    try {
      let bRes: Response | null = null;
      try {
        bRes = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${targetSymbol}USDT`, {
          signal: AbortSignal.timeout(3000),
        });
      } catch {
        bRes = await fetch(`https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${targetSymbol}USDT`, {
          signal: AbortSignal.timeout(3000),
        });
      }

      if (bRes && bRes.ok) {
        const bData: any = await bRes.json();
        const usdPrice = parseFloat(bData.lastPrice);
        if (!isNaN(usdPrice) && usdPrice > 0) {
          const usdInr = await fetchLiveUsdInrRate();
          const inrPrice = Math.round(usdPrice * usdInr * 100) / 100;
          const changePct = parseFloat(bData.priceChangePercent || '0');
          const prevClose = changePct !== 0 ? inrPrice / (1 + changePct / 100) : undefined;
          return { price: inrPrice, prevClose, symbol: `${targetSymbol}USDT` };
        }
      }
    } catch { }

    // ── Tier 3: TradingView Crypto Multi-Exchange Scanner ──
    // Queries Binance, Bybit, Gate.io, MEXC, KuCoin, OKX, Coinbase covering virtually ALL coins/tokens
    try {
      const tvRes = await fetch('https://scanner.tradingview.com/crypto/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: {
            tickers: [
              `BINANCE:${targetSymbol}USDT`,
              `BYBIT:${targetSymbol}USDT`,
              `GATEIO:${targetSymbol}USDT`,
              `MEXC:${targetSymbol}USDT`,
              `KUCOIN:${targetSymbol}USDT`,
              `OKX:${targetSymbol}USDT`,
              `COINBASE:${targetSymbol}USD`,
            ],
          },
          columns: ['close', 'change', 'description'],
        }),
        signal: AbortSignal.timeout(3500),
      });
      if (tvRes.ok) {
        const tvData: any = await tvRes.json();
        const rows: any[] = tvData?.data || [];
        const best = rows.find((r) => r.d && typeof r.d[0] === 'number' && r.d[0] > 0);
        if (best) {
          const usdPrice = best.d[0];
          const changePct = best.d[1] || 0;
          const usdInr = await fetchLiveUsdInrRate();
          const inrPrice = Math.round(usdPrice * usdInr * 100) / 100;
          const prevClose = changePct !== 0 ? inrPrice / (1 + changePct / 100) : undefined;
          return { price: inrPrice, prevClose, symbol: best.s };
        }
      }
    } catch { }

    // ── Tier 4: CoinGecko INR Simple Price ──
    const geckoIds = [coinId, targetSymbol.toLowerCase()].filter(Boolean);
    for (const gid of geckoIds) {
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${gid}&vs_currencies=inr&include_24hr_change=true`,
          { signal: AbortSignal.timeout(3000) }
        );
        if (res.ok) {
          const data: any = await res.json();
          const coinData = data?.[gid as string];
          if (coinData && typeof coinData.inr === 'number' && coinData.inr > 0) {
            const price = coinData.inr;
            const changePct = coinData.inr_24h_change || 0;
            const prevClose = changePct !== 0 ? price / (1 + changePct / 100) : undefined;
            return { price, prevClose, symbol: (gid as string).toUpperCase() };
          }
        }
      } catch { }
    }

    // ── Tier 5: Domestic Indian Exchange (CoinDCX / WazirX) Fallback ──
    try {
      const dcxRes = await fetch('https://api.coindcx.com/exchange/ticker', {
        signal: AbortSignal.timeout(3000),
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
    } catch { }

    // ── Tier 6: Yahoo Finance USD Fallback ──
    try {
      const chartRes = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(targetSymbol)}-USD`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(3500) }
      );
      if (chartRes.ok) {
        const data: any = await chartRes.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (meta && typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0) {
          const usdInr = await fetchLiveUsdInrRate();
          const price = Math.round(meta.regularMarketPrice * usdInr * 100) / 100;
          const change =
            typeof meta.fulldayChange === 'number'
              ? meta.fulldayChange * usdInr
              : typeof meta.regularMarketChange === 'number'
              ? meta.regularMarketChange * usdInr
              : undefined;
          const prevClose = change !== undefined ? price - change : undefined;
          return { price, prevClose, symbol: `${targetSymbol}-USD` };
        }
      }
    } catch { }
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

export function canonicalizeMfQuery(q: string): string {
  return q
    .toLowerCase()
    .replace(/\bppfas\b/g, 'parag parikh')
    .replace(/\breliance\b/g, 'nippon india')
    .replace(/\bidfc\b/g, 'bandhan')
    .replace(/\bl&t\b|\blnt\b/g, 'hsbc')
    .replace(/\bdspbr\b|\bdsp\s+blackrock\b/g, 'dsp')
    .replace(/\bft\b|\bfranklin\s+templeton\b/g, 'franklin')
    .replace(/\babsl\b|\bbirla\s+sun\s+life\b/g, 'aditya birla sun life');
}

export function scoreMfCandidate(item: { schemeCode: number; schemeName: string }, rawQuery: string): number {
  const stripped = stripBrokerSuffix(rawQuery);
  const normQuery = canonicalizeMfQuery(stripped);
  const qLower = normQuery.replace(/[^a-z0-9]+/g, ' ').trim();
  const sName = item.schemeName || '';
  const sLower = sName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  let score = 0;

  // 1. Exact match bonus
  if (sLower === qLower) return 300;
  if (sLower.includes(qLower)) score += 80;
  else if (qLower.includes(sLower) && sLower.length >= 8) score += 60;

  // 2. Token overlap (universal category & asset type matching)
  const stopWords = new Set(['fund', 'scheme', 'plan', 'option', 'growth', 'direct', 'regular', 'idcw', 'dividend', 'amc', 'mutual', 'the', 'of', 'and', '&', '-']);
  const qTokens = qLower.split(/\s+/).filter((t) => t.length >= 2 && !stopWords.has(t));
  const sTokens = new Set(sLower.split(/\s+/).filter((t) => t.length >= 2 && !stopWords.has(t)));

  if (qTokens.length === 0 || sTokens.size === 0) return score;

  let matchedCount = 0;
  for (const qt of qTokens) {
    // Equivalence matching for renamed categories:
    // bluechip <-> large cap, elss <-> tax saver
    const isBluechipMatch = (qt === 'bluechip' || qt === 'largecap' || qt === 'large') && (sTokens.has('bluechip') || sTokens.has('large') || sTokens.has('largecap'));
    const isTaxSaverMatch = (qt === 'taxsaver' || qt === 'tax' || qt === 'elss') && (sTokens.has('elss') || sTokens.has('tax') || sTokens.has('taxsaver'));

    if (sTokens.has(qt) || isBluechipMatch || isTaxSaverMatch) {
      score += 25;
      matchedCount++;
    } else {
      for (const st of sTokens) {
        if (st.includes(qt) || qt.includes(st)) {
          score += 12;
          matchedCount += 0.5;
          break;
        }
      }
    }
  }

  // First token brand alignment (AMC / Fund house matching: Tata, Quant, Navi, HDFC, SBI, Axis, Nippon, Bandhan, Parag, etc.)
  if (qTokens[0] && (sTokens.has(qTokens[0]) || (qTokens[0] === 'ppfas' && sTokens.has('parag')) || (qTokens[0] === 'reliance' && sTokens.has('nippon')))) {
    score += 40;
  }

  // Token coverage ratio reward
  const coverage = matchedCount / qTokens.length;
  score += Math.round(coverage * 50);

  // 3. Plan alignment (Direct vs Regular)
  const wantsDirect = /\b(direct|dir)\b/i.test(stripped);
  const wantsRegular = /\b(regular|reg)\b/i.test(stripped);
  const isDirect = /\b(direct|dir)\b/i.test(sName);
  const isRegular = /\b(regular|reg)\b/i.test(sName);

  if (wantsDirect) {
    if (isDirect) score += 40;
    if (isRegular) score -= 40;
  } else if (wantsRegular) {
    if (isRegular) score += 40;
    if (isDirect) score -= 40;
  } else {
    // If unspecified, default slight preference to Direct plan
    if (isDirect) score += 15;
  }

  // 4. Option alignment (Growth vs IDCW / Dividend / Payout / Reinvestment)
  const wantsIdcw = /\b(idcw|dividend|payout|reinvestment)\b/i.test(stripped);
  const isIdcw = /\b(idcw|dividend|payout|reinvestment)\b/i.test(sName);
  const isGrowth = /\bgrowth\b/i.test(sName);

  if (wantsIdcw) {
    if (isIdcw) score += 45;
    if (isGrowth) score -= 30;
  } else {
    if (isGrowth) score += 40;
    if (isIdcw) score -= 50;
  }

  // 5. Exclude defunct or non-retail options
  if (/institutional|unclaimed|segregated|bonus/i.test(sName)) {
    score -= 60;
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

// ──────────────────────────────────────────
// Official AMFI Daily NAV Engine (Direct from amfiindia.com)
// ──────────────────────────────────────────

interface AmfiTableEntry {
  code: number;
  isin: string;
  name: string;
  baseName: string;
  nav: number;
  date: string;
  isDirect: boolean;
  isGrowth: boolean;
}

let amfiTableCache: {
  timestamp: number;
  isinMap: Map<string, AmfiTableEntry>;
  codeMap: Map<number, AmfiTableEntry>;
  entries: AmfiTableEntry[];
} | null = null;

let amfiFetchPromise: Promise<{
  isinMap: Map<string, AmfiTableEntry>;
  codeMap: Map<number, AmfiTableEntry>;
  entries: AmfiTableEntry[];
} | null> | null = null;

const AMFI_CACHE_DURATION_MS = 15 * 60 * 1000; // 15 min cache for fast responsiveness

export async function getAmfiOfficialNavTable(): Promise<{
  isinMap: Map<string, AmfiTableEntry>;
  codeMap: Map<number, AmfiTableEntry>;
  entries: AmfiTableEntry[];
} | null> {
  const now = Date.now();
  if (amfiTableCache && now - amfiTableCache.timestamp < AMFI_CACHE_DURATION_MS) {
    return amfiTableCache;
  }
  if (amfiFetchPromise) {
    return amfiFetchPromise;
  }

  amfiFetchPromise = (async () => {
    try {
      let res: Response | null = null;
      // Direct AMFI portal endpoint (bypasses 301/302 redirects and returns in < 300ms)
      try {
        res = await fetch("https://portal.amfiindia.com/spages/NAVAll.txt", {
          headers: STANDARD_HEADERS,
          signal: AbortSignal.timeout(10000),
        });
      } catch (e1) {
        console.warn("[AMFI] portal.amfiindia.com failed, trying amfiindia.com fallback:", e1);
      }

      if (!res || !res.ok) {
        res = await fetch("https://www.amfiindia.com/spages/NAVAll.txt", {
          headers: STANDARD_HEADERS,
          signal: AbortSignal.timeout(15000),
        });
      }
      if (!res || !res.ok) return amfiTableCache;

      const text = await res.text();
      const lines = text.split("\n");
      const isinMap = new Map<string, AmfiTableEntry>();
      const codeMap = new Map<number, AmfiTableEntry>();
      const entries: AmfiTableEntry[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.includes(";")) continue;
        const parts = trimmedLine.split(";");
        if (parts.length < 5) continue;

        const code = parseInt(parts[0]?.trim(), 10);
        if (isNaN(code) || code <= 0) continue;

        const isin1 = parts[1]?.trim() || "";
        const isin2 = parts[2]?.trim() || "";
        let baseSchemeName = "";
        let plan = "";
        let option = "";
        let navStr = "";
        let dateStr = "";

        if (parts.length >= 8) {
          // Standard AMFI 8-column layout:
          // [0] Code, [1] ISIN Payout/Growth, [2] ISIN Reinvest, [3] Name, [4] Plan, [5] Option, [6] NAV, [7] Date
          baseSchemeName = parts[3]?.trim() || "";
          plan = parts[4]?.trim() || "";
          option = parts[5]?.trim() || "";
          navStr = parts[6]?.trim() || "";
          dateStr = parts[7]?.trim() || "";
        } else if (parts.length === 6 || parts.length === 7) {
          // Standard AMFI 6-column layout:
          // [0] Code, [1] ISIN1, [2] ISIN2, [3] Full Scheme Name, [4] NAV, [5] Date
          baseSchemeName = parts[3]?.trim() || "";
          navStr = parts[4]?.trim() || "";
          dateStr = parts[5]?.trim() || "";
        } else {
          const nonEmpty = parts.map((p) => p.trim()).filter(Boolean);
          if (nonEmpty.length >= 4) {
            dateStr = nonEmpty[nonEmpty.length - 1];
            navStr = nonEmpty[nonEmpty.length - 2];
            baseSchemeName = nonEmpty[3] || "";
          }
        }

        const nav = parseFloat(navStr);
        if (isNaN(nav) || nav <= 0) continue;

        const fullName = [baseSchemeName, plan, option].filter(Boolean).join(" - ");
        const primaryIsin = (isin1 && isin1 !== "-") ? isin1 : (isin2 && isin2 !== "-") ? isin2 : "";
        const isDirect = /direct/i.test(fullName);
        const isGrowth = /growth/i.test(fullName);

        const entry: AmfiTableEntry = {
          code,
          isin: primaryIsin,
          name: fullName,
          baseName: baseSchemeName,
          nav,
          date: dateStr,
          isDirect,
          isGrowth,
        };

        codeMap.set(code, entry);
        if (isin1 && isin1 !== "-") isinMap.set(isin1.toUpperCase(), entry);
        if (isin2 && isin2 !== "-") isinMap.set(isin2.toUpperCase(), entry);
        entries.push(entry);
      }

      if (entries.length > 0) {
        amfiTableCache = { timestamp: now, isinMap, codeMap, entries };
      }
      return amfiTableCache;
    } catch (err) {
      console.warn("[AMFI] Error fetching live NAVAll.txt from AMFI:", err);
      return amfiTableCache;
    } finally {
      amfiFetchPromise = null;
    }
  })();

  return amfiFetchPromise;
}

export async function fetchMfNav(
  name: string,
  notes?: string,
  knownSchemeCode?: number,
  knownIsin?: string
): Promise<{ nav: number; date?: string; prevNav?: number; schemeName?: string; schemeCode?: number; isin?: string } | null> {
  const combined = `${name} ${notes || ""}`;
  const isin = knownIsin || (combined.match(/\b(INF[A-Z0-9]{9})\b/i)?.[1]?.toUpperCase());

  // Extract any explicit scheme code from notes or name (avoiding personal folio numbers)
  const withoutFolio = combined.replace(/\b(?:folio|folio\s*no|folio\s*number|ac\s*no|account|acc)\s*[:#-]?\s*[\w\/-]+/gi, "");
  const explicitSchemeMatch = withoutFolio.match(/\b(?:scheme\s*code|amfi\s*code|amfi|code)\s*[:#-]?\s*(\d{6})\b/i) || withoutFolio.match(/\b\d{6}\b/);
  const codeNum = knownSchemeCode && knownSchemeCode > 0 ? knownSchemeCode : explicitSchemeMatch ? parseInt(explicitSchemeMatch[1] || explicitSchemeMatch[0], 10) : undefined;

  // 1. Instant Fast-Path: If scheme code or ISIN is known, query both official AMFI master feed and high-speed mirror,
  // and dynamically select whichever source has the strictly LATEST published date (Zero hardcoding).
  if (codeNum && codeNum > 0) {
    const amfiTablePromise = getAmfiOfficialNavTable();
    const mfApiPromise = (async () => {
      try {
        const latestRes = await fetch(`https://api.mfapi.in/mf/${codeNum}/latest`, {
          headers: STANDARD_HEADERS,
          signal: AbortSignal.timeout(3500),
        });
        if (latestRes.ok) {
          const details: any = await latestRes.json();
          const latest = details?.data?.[0];
          if (latest && latest.nav) {
            const navNum = parseFloat(latest.nav);
            if (!isNaN(navNum) && navNum > 0) {
              return {
                nav: navNum,
                date: latest.date || "",
                schemeName: details.meta?.scheme_name || name,
                schemeCode: codeNum,
                isin: details.meta?.isin_growth || isin,
              };
            }
          }
        }
      } catch { }
      return null;
    })();

    const [amfiTable, mfApiMatch] = await Promise.all([amfiTablePromise, mfApiPromise]);
    const amfiMatch = amfiTable?.codeMap.get(codeNum) || (isin ? amfiTable?.isinMap.get(isin.toUpperCase()) : null) || null;

    if (amfiMatch && mfApiMatch) {
      const amfiDateMs = parseNavDateToMs(amfiMatch.date);
      const mfApiDateMs = parseNavDateToMs(mfApiMatch.date);
      // Strictly latest published date wins:
      if (amfiDateMs >= mfApiDateMs) {
        return {
          nav: amfiMatch.nav,
          date: amfiMatch.date,
          schemeName: amfiMatch.name,
          schemeCode: amfiMatch.code,
          isin: amfiMatch.isin || isin,
        };
      } else {
        return mfApiMatch;
      }
    }

    if (amfiMatch) {
      return {
        nav: amfiMatch.nav,
        date: amfiMatch.date,
        schemeName: amfiMatch.name,
        schemeCode: amfiMatch.code,
        isin: amfiMatch.isin || isin,
      };
    }

    if (mfApiMatch) {
      return mfApiMatch;
    }
  }

  // 1.5. ISIN Fast-Path: If ISIN is known (e.g. INF879O01027), lookup directly in AMFI table
  if (isin) {
    const amfiTable = await getAmfiOfficialNavTable();
    const amfiMatch = amfiTable?.isinMap.get(isin.toUpperCase()) || null;
    if (amfiMatch) {
      return {
        nav: amfiMatch.nav,
        date: amfiMatch.date,
        schemeName: amfiMatch.name,
        schemeCode: amfiMatch.code,
        isin: amfiMatch.isin || isin,
      };
    }
  }

  // 2. High-Speed Cloudflare CDN Mirror Search (Instant 50ms response for ANY scheme name)
  try {
    const strippedName = stripBrokerSuffix(name);
    const clean = strippedName
      .replace(/^(name\s+of\s+(the\s+)?scheme|scheme\s*name|scheme)\s*[:：]\s*/i, "")
      .replace(/\bmidcap\b/gi, "mid cap")
      .replace(/\bsmallcap\b/gi, "small cap")
      .replace(/\blargecap\b/gi, "large cap")
      .replace(/\bflexicap\b/gi, "flexi cap")
      .replace(/\b(mutual\s*fund|amc|direct|regular|growth|idcw|payout|reinvestment|plan|option)\b/gi, "")
      .replace(/[\.\(\)₹\$\[\]\/\\-]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    const coreWords = clean.split(/\s+/).filter(Boolean);
    if (coreWords.length > 0) {
      const baseQuery = coreWords.join(" ");
      const compoundJoined = baseQuery
        .replace(/\bmid\s+cap\b/gi, "Midcap")
        .replace(/\bsmall\s+cap\b/gi, "Smallcap")
        .replace(/\blarge\s+cap\b/gi, "Largecap")
        .replace(/\bflexi\s+cap\b/gi, "Flexicap");
      const largeCapAlt = baseQuery.replace(/\bblue\s*chip\b/gi, "Large Cap");

      const queries: string[] = [
        baseQuery,
        compoundJoined,
        largeCapAlt !== baseQuery ? largeCapAlt : null,
        coreWords.slice(0, 4).join(" "),
        coreWords.slice(0, 3).join(" "),
        coreWords.slice(0, 2).join(" "),
      ].filter((q): q is string => Boolean(q) && q.length >= 3);

      const uniqueQueries = [...new Set(queries)];
      const candidateMap = new Map<number, { schemeCode: number; schemeName: string }>();

      for (const q of uniqueQueries) {
        try {
          const searchRes = await fetch(
            `https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`,
            { headers: STANDARD_HEADERS, signal: AbortSignal.timeout(3000) }
          );
          if (searchRes.ok) {
            const list: any[] = await searchRes.json();
            if (Array.isArray(list)) {
              for (const item of list) {
                if (!candidateMap.has(item.schemeCode)) {
                  candidateMap.set(item.schemeCode, item);
                }
              }
            }
          }
        } catch { }
        if (candidateMap.size >= 8) break;
      }

      if (candidateMap.size > 0) {
        const sorted = Array.from(candidateMap.values())
          .map((item) => ({ ...item, score: scoreMfCandidate(item, strippedName) }))
          .sort((a, b) => b.score - a.score);

        const top = sorted[0];
        if (top && top.score >= 40) {
          const amfiTablePromise = getAmfiOfficialNavTable();
          const mfApiPromise = (async () => {
            try {
              const latestRes = await fetch(
                `https://api.mfapi.in/mf/${top.schemeCode}/latest`,
                { headers: STANDARD_HEADERS, signal: AbortSignal.timeout(3000) }
              );
              if (latestRes.ok) {
                const details: any = await latestRes.json();
                const latest = details?.data?.[0];
                if (latest && latest.nav) {
                  const navNum = parseFloat(latest.nav);
                  if (!isNaN(navNum) && navNum > 0) {
                    return {
                      nav: navNum,
                      date: latest.date || "",
                      schemeName: details.meta?.scheme_name || top.schemeName,
                      schemeCode: top.schemeCode,
                      isin: details.meta?.isin_growth || isin,
                    };
                  }
                }
              }
            } catch { }
            return null;
          })();

          const [amfiTable, mfApiMatch] = await Promise.all([amfiTablePromise, mfApiPromise]);
          const amfiMatch = amfiTable?.codeMap.get(top.schemeCode) || null;

          if (amfiMatch && mfApiMatch) {
            const amfiDateMs = parseNavDateToMs(amfiMatch.date);
            const mfApiDateMs = parseNavDateToMs(mfApiMatch.date);
            if (amfiDateMs >= mfApiDateMs) {
              return {
                nav: amfiMatch.nav,
                date: amfiMatch.date,
                schemeName: amfiMatch.name,
                schemeCode: amfiMatch.code,
                isin: amfiMatch.isin || isin,
              };
            } else {
              return mfApiMatch;
            }
          }

          if (amfiMatch) {
            return {
              nav: amfiMatch.nav,
              date: amfiMatch.date,
              schemeName: amfiMatch.name,
              schemeCode: amfiMatch.code,
              isin: amfiMatch.isin || isin,
            };
          }

          if (mfApiMatch) {
            return mfApiMatch;
          }

          // Fallback to full endpoint
          const fullRes = await fetch(
            `https://api.mfapi.in/mf/${top.schemeCode}`,
            { headers: STANDARD_HEADERS, signal: AbortSignal.timeout(3500) }
          );
          if (fullRes.ok) {
            const details: any = await fullRes.json();
            const latest = details?.data?.[0];
            const prev = details?.data?.[1];
            if (latest && latest.nav) {
              const navNum = parseFloat(latest.nav);
              if (!isNaN(navNum) && navNum > 0) {
                return {
                  nav: navNum,
                  date: latest.date,
                  schemeName: details.meta?.scheme_name || top.schemeName,
                  prevNav: prev ? parseFloat(prev.nav) : undefined,
                  schemeCode: top.schemeCode,
                  isin: details.meta?.isin_growth || isin,
                };
              }
            }
          }
        }
      }
    }
  } catch { }

  // 3. Fallback: Official AMFI Portal Table (for ISIN or direct lookup)
  const amfiTable = await getAmfiOfficialNavTable();
  if (amfiTable) {
    if (isin && amfiTable.isinMap.has(isin)) {
      const match = amfiTable.isinMap.get(isin)!;
      return {
        nav: match.nav,
        date: match.date,
        schemeName: match.name,
        schemeCode: match.code,
        isin: match.isin || isin,
      };
    }

    if (codeNum && amfiTable.codeMap.has(codeNum)) {
      const match = amfiTable.codeMap.get(codeNum)!;
      return {
        nav: match.nav,
        date: match.date,
        schemeName: match.name,
        schemeCode: match.code,
        isin: match.isin || isin,
      };
    }

    const strippedName = stripBrokerSuffix(name);
    const wantsDirect = /\bdirect\b/i.test(strippedName);
    const wantsRegular = /\bregular\b/i.test(strippedName);
    const wantsIdcw = /\b(idcw|dividend|payout|reinvestment)\b/i.test(strippedName);

    let bestMatch: AmfiTableEntry | null = null;
    let bestScore = -1;

    for (const item of amfiTable.entries) {
      if (wantsDirect && !item.isDirect) continue;
      if (wantsRegular && item.isDirect) continue;
      if (wantsIdcw && item.isGrowth) continue;

      const score = scoreMfCandidate({ schemeCode: item.code, schemeName: item.name }, strippedName);
      if (score > bestScore && score >= 40) {
        bestScore = score;
        bestMatch = item;
      }
    }

    if (bestMatch && bestScore >= 40) {
      return {
        nav: bestMatch.nav,
        date: bestMatch.date,
        schemeName: bestMatch.name,
        schemeCode: bestMatch.code,
        isin: bestMatch.isin || isin,
      };
    }
  }

  return null;
}

export const internalListInvestments = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    investmentIds: v.optional(v.array(v.id("investments"))),
  },
  handler: async (ctx, args) => {
    if (args.investmentIds && args.investmentIds.length > 0) {
      const results = [];
      for (const id of args.investmentIds) {
        const item = await ctx.db.get(id);
        if (item && (!args.userId || item.userId === args.userId)) {
          results.push(item);
        }
      }
      return results;
    }
    if (args.userId) {
      return await ctx.db
        .query("investments")
        .withIndex("by_user", (q) => q.eq("userId", args.userId!))
        .collect();
    }
    return await ctx.db.query("investments").collect();
  },
});

export const internalListAllStockCache = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("stockPriceCache").take(200);
  },
});

export const internalBatchUpdatePrices = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    updates: v.array(
      v.object({
        id: v.id("investments"),
        currentValue: v.number(),
        currentPrice: v.optional(v.number()),
        units: v.optional(v.number()),
        schemeCode: v.optional(v.number()),
        isin: v.optional(v.string()),
        ticker: v.optional(v.string()),
        manualPrice: v.optional(v.boolean()),
        manualPriceUpdatedAt: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const u of args.updates) {
      const inv = await ctx.db.get(u.id);
      if (inv && (!args.userId || inv.userId === args.userId)) {
        const patchData: any = {
          currentValue: Math.max(0, u.currentValue),
          currentPrice: u.currentPrice ?? inv.currentPrice,
          units: u.units ?? inv.units,
          schemeCode: u.schemeCode ?? inv.schemeCode,
          isin: u.isin ?? inv.isin,
          ticker: u.ticker ?? inv.ticker,
          updatedAt: now,
        };
        if (u.manualPrice !== undefined) {
          patchData.manualPrice = u.manualPrice;
        }
        if (u.manualPriceUpdatedAt !== undefined) {
          patchData.manualPriceUpdatedAt = u.manualPriceUpdatedAt;
        }
        await ctx.db.patch(u.id, patchData);
      }
    }
    return { success: true, count: args.updates.length };
  },
});

// ──────────────────────────────────────────
// AMFI Mutual Fund Cache DB Engine
// ──────────────────────────────────────────

export function normalizeMfSearchKey(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/^(name\s+of\s+(the\s+)?scheme|scheme\s*name|scheme)\s*[:：]\s*/i, "")
    .replace(/\b(mutual\s*fund|amc|direct|regular|growth|idcw|dividend|payout|reinvestment|plan|option)\b/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Checks the persistent AMFI cache database for an existing NAV record
 * by unique ISIN, official 6-digit schemeCode, or normalized search key.
 */
export const internalGetCachedMfNav = internalQuery({
  args: {
    isin: v.optional(v.string()),
    schemeCode: v.optional(v.number()),
    searchKey: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Direct index lookup by ISIN (100% unique primary mapping key)
    if (args.isin) {
      const byIsin = await ctx.db
        .query("mfNavCache")
        .withIndex("by_isin", (q) => q.eq("isin", args.isin!))
        .first();
      if (byIsin) return byIsin;
    }

    // 2. Direct index lookup by normalized search key (guarantees fund name fidelity)
    if (args.searchKey) {
      const byKey = await ctx.db
        .query("mfNavCache")
        .withIndex("by_search_key", (q) => q.eq("searchKey", args.searchKey))
        .first();
      if (byKey) return byKey;
    }

    // 3. Lookup by verified AMFI Scheme Code (cross-validated against fund name)
    if (args.schemeCode && args.schemeCode > 0) {
      const byCode = await ctx.db
        .query("mfNavCache")
        .withIndex("by_scheme_code", (q) => q.eq("schemeCode", args.schemeCode!))
        .first();
      if (byCode) {
        // Guard: Prevent non-unique folio collisions from returning an unrelated scheme's cache
        if (!args.searchKey || schemeNameSimilarity(byCode.schemeName, args.searchKey) >= 0.2) {
          return byCode;
        }
      }
    }

    return null;
  },
});

/**
 * Inserts or updates an authentic AMFI NAV entry into the cache DB.
 * Overwrites any stale/wrong data with authentic data directly from AMFI.
 */
export const internalUpsertMfNavCache = internalMutation({
  args: {
    isin: v.optional(v.string()),
    schemeCode: v.number(),
    schemeName: v.string(),
    nav: v.number(),
    navDate: v.string(),
    prevNav: v.optional(v.number()),
    searchKey: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // 1. Check if record with this isin already exists
    if (args.isin) {
      const existingByIsin = await ctx.db
        .query("mfNavCache")
        .withIndex("by_isin", (q) => q.eq("isin", args.isin!))
        .first();
      if (existingByIsin) {
        await ctx.db.patch(existingByIsin._id, {
          schemeCode: args.schemeCode > 0 ? args.schemeCode : existingByIsin.schemeCode,
          schemeName: args.schemeName,
          nav: args.nav,
          navDate: args.navDate,
          prevNav: args.prevNav,
          searchKey: args.searchKey || existingByIsin.searchKey,
          lastFetchedAt: now,
        });
        return existingByIsin._id;
      }
    }

    // 2. Check if record with this schemeCode already exists
    if (args.schemeCode > 0) {
      const existing = await ctx.db
        .query("mfNavCache")
        .withIndex("by_scheme_code", (q) => q.eq("schemeCode", args.schemeCode))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          isin: args.isin || existing.isin,
          schemeName: args.schemeName,
          nav: args.nav,
          navDate: args.navDate,
          prevNav: args.prevNav,
          searchKey: args.searchKey || existing.searchKey,
          lastFetchedAt: now,
        });
        return existing._id;
      }
    }

    // 3. Check if record with this searchKey already exists
    if (args.searchKey) {
      const existingByKey = await ctx.db
        .query("mfNavCache")
        .withIndex("by_search_key", (q) => q.eq("searchKey", args.searchKey))
        .first();
      if (existingByKey) {
        await ctx.db.patch(existingByKey._id, {
          isin: args.isin || existingByKey.isin,
          schemeCode: args.schemeCode > 0 ? args.schemeCode : existingByKey.schemeCode,
          schemeName: args.schemeName,
          nav: args.nav,
          navDate: args.navDate,
          prevNav: args.prevNav,
          lastFetchedAt: now,
        });
        return existingByKey._id;
      }
    }

    // 4. Insert fresh authentic AMFI record
    return await ctx.db.insert("mfNavCache", {
      isin: args.isin,
      schemeCode: args.schemeCode,
      schemeName: args.schemeName,
      nav: args.nav,
      navDate: args.navDate,
      prevNav: args.prevNav,
      searchKey: args.searchKey,
      lastFetchedAt: now,
    });
  },
});

/**
 * Purges stale/inactive AMFI cache records older than the cutoff (default: 30 days)
 * ensuring the database stays clean and only holds actively referenced and verified schemes.
 */
export const internalPurgeStaleMfCache = internalMutation({
  args: {
    olderThanDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.olderThanDays ?? 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const staleItems = await ctx.db
      .query("mfNavCache")
      .withIndex("by_last_fetched", (q) => q.lt("lastFetchedAt", cutoff))
      .take(100);

    let purged = 0;
    for (const item of staleItems) {
      await ctx.db.delete(item._id);
      purged++;
    }
    return { purged };
  },
});

/**
 * Public query for client components to read from the authentic AMFI Cache DB.
 */
export const getCachedMfNav = query({
  args: {
    name: v.string(),
    schemeCode: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cleanKey = normalizeMfSearchKey(args.name);
    if (args.schemeCode && args.schemeCode > 0) {
      const byCode = await ctx.db
        .query("mfNavCache")
        .withIndex("by_scheme_code", (q) => q.eq("schemeCode", args.schemeCode!))
        .first();
      if (byCode) return byCode;
    }
    if (cleanKey) {
      const byKey = await ctx.db
        .query("mfNavCache")
        .withIndex("by_search_key", (q) => q.eq("searchKey", cleanKey))
        .first();
      if (byKey) return byKey;
    }
    return null;
  },
});

/**
 * Lists all active entries in the AMFI cache DB for verification.
 */
export const internalListAllMfCache = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("mfNavCache")
      .withIndex("by_last_fetched")
      .take(200);
  },
});

// ──────────────────────────────────────────
// Indian Stock Exchanges & Market Timing Helper (IST Timezone Aware)
// ──────────────────────────────────────────

export const INDIAN_MARKET_HOLIDAYS = new Set([
  "01-26", // Republic Day
  "03-08", // Mahashivratri
  "03-25", // Holi
  "03-29", // Good Friday
  "04-11", // Id-Ul-Fitr
  "04-14", // Dr. Ambedkar Jayanti
  "04-17", // Ram Navami
  "05-01", // Maharashtra Day / Labour Day
  "06-17", // Bakri Id
  "07-17", // Muharram
  "08-15", // Independence Day
  "10-02", // Mahatma Gandhi Jayanti
  "10-12", // Dussehra
  "10-31", // Diwali Laxmi Pujan
  "11-01", // Diwali Balipratipada
  "11-15", // Gurunanak Jayanti
  "12-25", // Christmas
]);

export interface IndianMarketStatus {
  isOpen: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  isNonMarketHours: boolean;
  isNightNavWindow: boolean; // 9:00 PM to 12:00 AM IST on weekdays when AMCs release daily NAVs
  reason: string;
  istDateStr: string;
  istTimeStr: string;
  currentMinutes: number;
}

/**
 * Calculates current Indian Stock Market (NSE/BSE) trading session state in IST (UTC+5:30).
 * Continuous trading session: 09:15 AM to 03:30 PM IST on weekdays, excluding public holidays.
 * AMC Daily NAV Release Window: 09:00 PM to 12:00 AM IST (21:00 to 24:00 IST = 1260 to 1440 min).
 */
export function getIndianMarketStatus(): IndianMarketStatus {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const istDate = new Date(utcMs + 5.5 * 60 * 60 * 1000);

  const dayOfWeek = istDate.getDay(); // 0 = Sunday, 6 = Saturday
  const hours = istDate.getHours();
  const minutes = istDate.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  // Friday night AMC NAV publishing window extends until 02:00 AM IST on Saturday
  const isSaturdayEarlyMorning = dayOfWeek === 6 && currentMinutes <= 120;
  const isWeekend = dayOfWeek === 0 || (dayOfWeek === 6 && !isSaturdayEarlyMorning);

  const m = String(istDate.getMonth() + 1).padStart(2, "0");
  const d = String(istDate.getDate()).padStart(2, "0");
  const monthDay = `${m}-${d}`;

  const isHoliday = INDIAN_MARKET_HOLIDAYS.has(monthDay);

  // NSE/BSE Trading Hours: 09:15 AM to 03:30 PM IST (555 to 930 minutes)
  const isTradingSession = currentMinutes >= 555 && currentMinutes <= 930;
  const isOpen = !isWeekend && !isHoliday && isTradingSession;
  const isNonMarketHours = !isOpen;

  // AMC Daily NAV Release Window: 09:00 PM to 12:00 AM IST on regular weekdays + Friday night rollover to Saturday 02:00 AM IST
  const isNightNavWindow = (!isWeekend && !isHoliday && currentMinutes >= 1260) || isSaturdayEarlyMorning;

  let reason = "Market Open (Trading Active)";
  if (isSaturdayEarlyMorning) {
    reason = "Market Closed (Friday Night AMC NAV Release Window: 9 PM - 2 AM IST)";
  } else if (isWeekend) {
    reason = dayOfWeek === 6 ? "Market Closed (Saturday - No NAV Updates)" : "Market Closed (Sunday - No NAV Updates)";
  } else if (isHoliday) {
    reason = "Market Closed (NSE/BSE Public Holiday - No NAV Updates)";
  } else if (isNightNavWindow) {
    reason = "Market Closed (Night NAV Release Window: 9 PM - 12 AM IST)";
  } else if (currentMinutes < 555) {
    reason = "Market Closed (Pre-Market / Opens 9:15 AM IST)";
  } else if (currentMinutes > 930) {
    reason = "Market Closed (After-Hours / Closes 3:30 PM IST)";
  }

  const istDateStr = `${istDate.getFullYear()}-${m}-${d}`;
  const istTimeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} IST`;

  return {
    isOpen,
    isWeekend,
    isHoliday,
    isNonMarketHours,
    isNightNavWindow,
    reason,
    istDateStr,
    istTimeStr,
    currentMinutes,
  };
}

/**
 * Public query for client components to display current market status.
 */
export const getMarketStatus = query({
  args: {},
  handler: async () => {
    return getIndianMarketStatus();
  },
});

/**
 * Calculates the UTC timestamp (ms) of the most recent completed market trading session close (15:30 IST).
 * - If called after 15:30 IST on a weekday trading day, returns today at 15:30 IST.
 * - If called before 15:30 IST on a trading day or on weekend/holiday, rolls backwards to the prior trading session's close.
 */
export function getLatestMarketCloseTimeMs(customNow?: Date): number {
  const now = customNow || new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const istDate = new Date(utcMs + 5.5 * 60 * 60 * 1000);

  const hours = istDate.getHours();
  const minutes = istDate.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  const target = new Date(istDate);
  // If today is a trading day but it's before 15:30 IST (930 mins),
  // today's session has not closed yet; latest closed session was previous trading day.
  if (currentMinutes < 930) {
    target.setDate(target.getDate() - 1);
  }

  for (let i = 0; i < 14; i++) {
    const day = target.getDay();
    const m = String(target.getMonth() + 1).padStart(2, "0");
    const d = String(target.getDate()).padStart(2, "0");
    const monthDay = `${m}-${d}`;
    const isWeekend = day === 0 || day === 6;
    const isHoliday = INDIAN_MARKET_HOLIDAYS.has(monthDay);
    if (!isWeekend && !isHoliday) {
      // 15:30 IST on target date in UTC is 10:00 UTC (15:30 - 5:30)
      return Date.UTC(target.getFullYear(), target.getMonth(), target.getDate(), 10, 0, 0);
    }
    target.setDate(target.getDate() - 1);
  }
  return 0;
}

/**
 * Calculates the latest expected published AMFI trade date in "DD-MM-YYYY" format based on IST timezone.
 * - AMCs compute and release new NAV batches each weekday starting at 09:00 PM IST (1260 mins).
 * - Before 09:00 PM IST on a trading day, today's NAV is not published yet; the latest expected date is the PREVIOUS trading session.
 * - After 09:00 PM IST on a trading day, today's NAV begins releasing.
 * - Weekends (Sat/Sun) and Indian Market Public Holidays roll back to the most recent completed trading session (e.g. Friday).
 */
export function getLatestExpectedMfNavDate(customNow?: Date): string {
  const now = customNow || new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utcMs + 5.5 * 60 * 60 * 1000);

  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  const target = new Date(ist);
  // Before 9:00 PM IST, today's NAV has not been generated by AMCs yet
  if (currentMinutes < 1260) {
    target.setDate(target.getDate() - 1);
  }

  // Roll backwards past weekends and NSE/BSE holidays
  for (let i = 0; i < 14; i++) {
    const day = target.getDay();
    const m = String(target.getMonth() + 1).padStart(2, "0");
    const d = String(target.getDate()).padStart(2, "0");
    const monthDay = `${m}-${d}`;
    const isWeekend = day === 0 || day === 6;
    const isHoliday = INDIAN_MARKET_HOLIDAYS.has(monthDay);
    if (!isWeekend && !isHoliday) {
      return `${d}-${m}-${target.getFullYear()}`;
    }
    target.setDate(target.getDate() - 1);
  }
  return "";
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Converts "DD-MM-YYYY", "DD-MMM-YYYY" (e.g. 24-Sep-2026), or "YYYY-MM-DD" string into UTC timestamp milliseconds for safe comparison.
 */
export function parseNavDateToMs(dateStr: string): number {
  if (!dateStr) return 0;
  const parts = dateStr.trim().split(/[-/\s]+/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      const y = Number(parts[0]);
      const mStr = parts[1].toLowerCase().slice(0, 3);
      const m = MONTH_MAP[mStr] !== undefined ? MONTH_MAP[mStr] : Number(parts[1]) - 1;
      const d = Number(parts[2]);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d).getTime();
    } else {
      // DD-MM-YYYY or DD-MMM-YYYY (e.g. 24-Sep-2026 or 24-09-2026)
      const d = Number(parts[0]);
      const mStr = parts[1].toLowerCase().slice(0, 3);
      const m = MONTH_MAP[mStr] !== undefined ? MONTH_MAP[mStr] : Number(parts[1]) - 1;
      const y = Number(parts[2]);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d).getTime();
    }
  }
  const f = new Date(dateStr);
  return isNaN(f.getTime()) ? 0 : f.getTime();
}

/**
 * Dynamic AMFI Cache Freshness Policy (IST Timezone Aware):
 */
export function getMfCacheTtlMs(): number {
  const status = getIndianMarketStatus();
  // 1. Weekends & official NSE/BSE holidays: AMCs do not publish new NAVs, cache stays frozen
  if (status.isWeekend || status.isHoliday) {
    return 24 * 60 * 60 * 1000;
  }
  // 2. Weekday Night NAV release window (09:00 PM to 12:00 AM IST) - 50-minute TTL for 1-hour interval cron
  if (status.isNightNavWindow) {
    return 50 * 60 * 1000;
  }
  // 3. Regular daytime market hours (NAV does not change intraday)
  return 6.5 * 60 * 60 * 1000;
}

/**
 * Primary AMFI Gateway:
 * - Checks persistent Cache DB first.
 * - Compares cached navDate against getLatestExpectedMfNavDate().
 * - If cached navDate matches or exceeds expected trade date, the record is ALREADY current
 *   for this trading day and returns with zero network requests.
 * - If cached navDate is older than expected trade date (e.g. yesterday's date when today's
 *   date is expected), the record is STALE and re-queries AMFI/MFAPI directly!
 * - If forced (args.force = true), re-verifies immediately.
 */
async function getOrFetchMfNavWithCache(
  ctx: any,
  name: string,
  notes?: string,
  options?: { force?: boolean; knownSchemeCode?: number; knownIsin?: string }
): Promise<{ nav: number; date?: string; prevNav?: number; schemeName?: string; schemeCode?: number; isin?: string } | null> {
  const cleanKey = normalizeMfSearchKey(name);
  const combined = `${name} ${notes || ''}`;
  const resolvedIsin = options?.knownIsin || (combined.match(/\b(INF[A-Z0-9]{9})\b/i)?.[1]?.toUpperCase());
  const withoutFolio = combined.replace(/\b(?:folio|folio\s*no|folio\s*number|ac\s*no|account|acc)\s*[:#-]?\s*[\w\/-]+/gi, '');
  const explicitSchemeMatch = withoutFolio.match(/\b(?:scheme\s*code|amfi\s*code|amfi)\s*[:#-]?\s*(\d{6})\b/i);
  const explicitCode = options?.knownSchemeCode || (explicitSchemeMatch ? parseInt(explicitSchemeMatch[1], 10) : undefined);

  // 1. Check persistent Cache DB first (queries by isin, schemeCode, or searchKey)
  const cached: any = await ctx.runQuery(internal.investments.internalGetCachedMfNav, {
    isin: resolvedIsin,
    schemeCode: explicitCode,
    searchKey: cleanKey,
  });

  // Self-healing: if cached record exists but was missing isin, and we now have resolvedIsin,
  // update the cache record in the DB!
  if (cached && !cached.isin && resolvedIsin) {
    await ctx.runMutation(internal.investments.internalUpsertMfNavCache, {
      isin: resolvedIsin,
      schemeCode: cached.schemeCode,
      schemeName: cached.schemeName,
      nav: cached.nav,
      navDate: cached.navDate,
      prevNav: cached.prevNav,
      searchKey: cached.searchKey || cleanKey,
    });
    cached.isin = resolvedIsin;
  }

  const now = Date.now();
  const expectedDate = getLatestExpectedMfNavDate();
  const expectedDateMs = parseNavDateToMs(expectedDate);
  const cachedDateMs = cached?.navDate ? parseNavDateToMs(cached.navDate) : 0;
  // If the cached entry's navDate is earlier than expected latest trade date, it is mathematically stale
  const isDateStale = !cached?.navDate || cachedDateMs < expectedDateMs;

  // 1. If not forcing refresh, and cached NAV date is already matching or newer than expected trade date:
  if (!options?.force && cached && cached.nav > 0 && !isDateStale) {
    return {
      nav: cached.nav,
      date: cached.navDate,
      schemeName: cached.schemeName,
      prevNav: cached.prevNav,
      schemeCode: cached.schemeCode,
      isin: cached.isin || resolvedIsin,
    };
  }

  // 2. If not forcing refresh, and cached record is NOT stale and was updated very recently (< 5 minutes ago)
  if (!options?.force && cached && cached.nav > 0 && !isDateStale && now - (cached.lastFetchedAt || 0) < 5 * 60 * 1000) {
    return {
      nav: cached.nav,
      date: cached.navDate,
      schemeName: cached.schemeName,
      prevNav: cached.prevNav,
      schemeCode: cached.schemeCode,
      isin: cached.isin || resolvedIsin,
    };
  }

  // 3. Cache miss, force requested, or cached date is stale:
  const knownCode = cached?.schemeCode || explicitCode;
  const amfi = await fetchMfNav(name, notes, knownCode, resolvedIsin);
  if (amfi && amfi.nav > 0) {
    const finalIsin = amfi.isin || resolvedIsin;
    const resolvedCode = amfi.schemeCode || knownCode || 0;
    if (resolvedCode > 0) {
      // Immediately correct / update the cache DB with 100% authentic AMFI data
      await ctx.runMutation(internal.investments.internalUpsertMfNavCache, {
        isin: finalIsin,
        schemeCode: resolvedCode,
        schemeName: amfi.schemeName || cached?.schemeName || name,
        nav: amfi.nav,
        navDate: amfi.date || expectedDate,
        prevNav: amfi.prevNav,
        searchKey: cleanKey,
      });
    }
    return { ...amfi, isin: finalIsin };
  }

  // 4. Fallback: If AMFI network timed out or failed temporarily, return cached record
  if (cached && cached.nav > 0) {
    return {
      nav: cached.nav,
      date: cached.navDate,
      schemeName: cached.schemeName,
      prevNav: cached.prevNav,
      schemeCode: cached.schemeCode,
      isin: cached.isin || resolvedIsin,
    };
  }

  return null;
}

/**
 * Automatically propagates authentic fresh NAVs from mfNavCache into matching user investment holdings.
 */
export const internalSyncHoldingsFromMfCache = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allCache = await ctx.db.query("mfNavCache").collect();
    if (allCache.length === 0) return { updated: 0 };

    const cacheBySchemeCode = new Map<number, (typeof allCache)[0]>();
    const cacheByIsin = new Map<string, (typeof allCache)[0]>();
    const cacheByKey = new Map<string, (typeof allCache)[0]>();

    for (const c of allCache) {
      if (c.schemeCode > 0) cacheBySchemeCode.set(c.schemeCode, c);
      if (c.isin) cacheByIsin.set(c.isin.toUpperCase(), c);
      if (c.searchKey) cacheByKey.set(c.searchKey, c);
    }

    const investments = await ctx.db.query("investments").collect();
    let updated = 0;
    const now = Date.now();

    for (const inv of investments) {
      if (inv.assetType !== "mutual_fund" && !(inv.assetType === "gold" && /fund/i.test(inv.name))) {
        continue;
      }
      let match: (typeof allCache)[0] | undefined;
      if (inv.schemeCode && cacheBySchemeCode.has(inv.schemeCode)) {
        match = cacheBySchemeCode.get(inv.schemeCode);
      } else if (inv.isin && cacheByIsin.has(inv.isin.toUpperCase())) {
        match = cacheByIsin.get(inv.isin.toUpperCase());
      } else {
        const key = normalizeMfSearchKey(inv.name);
        if (key && cacheByKey.has(key)) {
          match = cacheByKey.get(key);
        }
      }

      if (match && match.nav > 0) {
        const units = inv.units || (inv.currentPrice ? inv.currentValue / inv.currentPrice : 0);
        const newCurrentValue = units > 0 ? Number((units * match.nav).toFixed(2)) : inv.currentValue;

        if (inv.currentPrice !== match.nav || inv.currentValue !== newCurrentValue) {
          await ctx.db.patch(inv._id, {
            currentPrice: match.nav,
            currentValue: newCurrentValue,
            schemeCode: match.schemeCode || inv.schemeCode,
            isin: match.isin || inv.isin,
            updatedAt: now,
          });
          updated++;
        }
      }
    }
    return { updated };
  },
});

/**
 * Lists all distinct mutual fund schemes currently held by ANY user across the entire application.
 */
export const internalListAllInvestedMfSchemes = internalQuery({
  args: {},
  handler: async (ctx) => {
    const investments = await ctx.db.query("investments").collect();
    const mfInvestments = investments.filter(
      (inv) => inv.assetType === "mutual_fund" || (inv.assetType === "gold" && /fund/i.test(inv.name))
    );

    const uniqueFunds = new Map<string, {
      name: string;
      notes?: string;
      schemeCode?: number;
      isin?: string;
      searchKey: string;
    }>();

    for (const inv of mfInvestments) {
      const isin = inv.isin?.toUpperCase();
      const code = inv.schemeCode;
      const searchKey = normalizeMfSearchKey(inv.name);
      const key = isin || (code && code > 0 ? `code_${code}` : searchKey);

      if (!uniqueFunds.has(key)) {
        uniqueFunds.set(key, {
          name: inv.name,
          notes: inv.notes,
          schemeCode: code,
          isin,
          searchKey,
        });
      }
    }

    return Array.from(uniqueFunds.values());
  },
});

/**
 * Background verification and maintenance action:
 * Rechecks all invested mutual fund schemes across all users against official AMFI API.
 * 
 * Schedule & Market Timing Rules:
 * - Runs during the AMC Night NAV Release Window (09:00 PM to 12:00 AM IST) on weekdays.
 * - Weekends (Saturday & Sunday) and official NSE/BSE holidays have NO NAV publication.
 *   This action immediately skips on weekends/holidays with ZERO API calls and ZERO DB writes.
 * - During active night windows, runs at 1-hour intervals to verify and overwrite the cache DB
 *   with newly published authentic NAVs and update all users' holdings.
 */
export const internalVerifyAndCleanMfCacheJob = internalAction({
  args: {},
  handler: async (ctx) => {
    const marketStatus = getIndianMarketStatus();

    // Guard: On weekends (Sat/Sun) and official NSE/BSE holidays, AMCs do NOT calculate or release NAVs.
    if (marketStatus.isWeekend || marketStatus.isHoliday) {
      return { skipped: true, reason: marketStatus.reason };
    }

    // 1. Fetch all distinct mutual fund schemes invested across ALL users in the app
    const investedSchemes: any[] = await ctx.runQuery(internal.investments.internalListAllInvestedMfSchemes, {});
    if (!investedSchemes || investedSchemes.length === 0) return { verified: 0 };

    const expectedDate = getLatestExpectedMfNavDate();
    const expectedDateMs = parseNavDateToMs(expectedDate);
    const now = Date.now();
    const ttlMs = getMfCacheTtlMs(); // 50 mins during 9 PM - 12 AM night window

    let updatedCount = 0;

    for (const scheme of investedSchemes) {
      // Check existing cache record
      const cached: any = await ctx.runQuery(internal.investments.internalGetCachedMfNav, {
        isin: scheme.isin,
        schemeCode: scheme.schemeCode,
        searchKey: scheme.searchKey,
      });

      const cachedDateMs = cached?.navDate ? parseNavDateToMs(cached.navDate) : 0;
      const isDateStale = !cached?.navDate || cachedDateMs < expectedDateMs;
      const isTtlExpired = !cached?.lastFetchedAt || (now - cached.lastFetchedAt >= ttlMs);

      // Re-verify if date is stale or TTL has expired (1 hour interval during night window)
      if (isDateStale || isTtlExpired) {
        try {
          const amfi = await fetchMfNav(scheme.name, scheme.notes, scheme.schemeCode, scheme.isin);
          if (amfi && amfi.nav > 0) {
            await ctx.runMutation(internal.investments.internalUpsertMfNavCache, {
              isin: amfi.isin || scheme.isin,
              schemeCode: amfi.schemeCode || scheme.schemeCode || 0,
              schemeName: amfi.schemeName || scheme.name,
              nav: amfi.nav,
              navDate: amfi.date || expectedDate,
              prevNav: amfi.prevNav,
              searchKey: scheme.searchKey,
            });
            updatedCount++;
          }
        } catch (err) {
          console.warn(`[CronVerify] Error verifying ${scheme.name}:`, err);
        }
      }
    }

    // 2. Propagate newly verified authentic NAVs to matching holdings across ALL users
    await ctx.runMutation(internal.investments.internalSyncHoldingsFromMfCache, {});

    // 3. Fully sync and reconcile all active portfolio holdings with official live market prices
    try {
      await ctx.runAction(api.investments.syncLiveMarketPrices, { force: true });
    } catch (err) {
      console.warn("[CronVerify] Error in syncLiveMarketPrices:", err);
    }

    return { verified: investedSchemes.length, updated: updatedCount };
  },
});

/**
 * Manual or client-initiated verification action to recheck all holdings against AMFI
 * and immediately correct any cache discrepancies.
 */
export const verifyAndCorrectMfCache = action({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { verified: 0, corrected: 0 };

    const investments: any[] = await ctx.runQuery(
      internal.investments.internalListInvestments,
      { userId }
    );

    const mfHoldings = investments.filter(
      (inv) => inv.assetType === "mutual_fund" || (inv.assetType === "gold" && /fund/i.test(inv.name))
    );

    const expectedDate = getLatestExpectedMfNavDate();
    const expectedDateMs = parseNavDateToMs(expectedDate);
    let verified = 0;
    let corrected = 0;

    for (const inv of mfHoldings) {
      const cleanKey = normalizeMfSearchKey(inv.name);
      const withoutFolio = `${inv.name} ${inv.notes || ''}`.replace(/\b(?:folio|folio\s*no|folio\s*number|ac\s*no|account|acc)\s*[:#-]?\s*[\w\/-]+/gi, '');
      const explicitSchemeMatch = withoutFolio.match(/\b(?:scheme\s*code|amfi\s*code|amfi)\s*[:#-]?\s*(\d{6})\b/i);
      const explicitCode = explicitSchemeMatch ? parseInt(explicitSchemeMatch[1], 10) : undefined;

      const cached: any = await ctx.runQuery(internal.investments.internalGetCachedMfNav, {
        schemeCode: explicitCode,
        searchKey: cleanKey,
      });

      const cachedDateMs = cached?.navDate ? parseNavDateToMs(cached.navDate) : 0;
      const isDateStale = !cached?.navDate || cachedDateMs < expectedDateMs;

      if (!args.force && cached && !isDateStale) {
        continue;
      }

      verified++;
      const knownCode = cached?.schemeCode || explicitCode;
      const amfi = await fetchMfNav(inv.name, inv.notes, knownCode);
      if (amfi && amfi.nav > 0) {
        const hasDivergence = !cached || Math.abs(cached.nav - amfi.nav) > 0.0001 || cached.navDate !== amfi.date;
        if (hasDivergence) corrected++;

        const resolvedCode = amfi.schemeCode || knownCode || 0;
        if (resolvedCode > 0) {
          await ctx.runMutation(internal.investments.internalUpsertMfNavCache, {
            schemeCode: resolvedCode,
            schemeName: amfi.schemeName || inv.name,
            nav: amfi.nav,
            navDate: amfi.date || expectedDate,
            prevNav: amfi.prevNav,
            searchKey: cleanKey,
          });
        }
      }
    }

    return { verified, corrected, expectedDate };
  },
});

// ──────────────────────────────────────────
// Dedicated Stock & Equity Cache DB Engine (35s Market / Frozen Non-Market)
// ──────────────────────────────────────────

export function normalizeStockSearchKey(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\b(limited|ltd|corporation|corp|company|co|plc|pvt|private)\b\.?/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Checks the persistent Stock Cache Database by unique ISIN, ticker symbol, or normalized search key.
 */
export const internalGetCachedStockPrice = internalQuery({
  args: {
    isin: v.optional(v.string()),
    symbol: v.optional(v.string()),
    searchKey: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Primary: Address stock by its unique ISIN (100% unique primary mapping key)
    if (args.isin) {
      const byIsin = await ctx.db
        .query("stockPriceCache")
        .withIndex("by_isin", (q) => q.eq("isin", args.isin!))
        .first();
      if (byIsin) return byIsin;
    }

    // 2. Secondary: Lookup by resolved Ticker.NS or Ticker.BO
    if (args.symbol) {
      const bySym = await ctx.db
        .query("stockPriceCache")
        .withIndex("by_symbol", (q) => q.eq("symbol", args.symbol!))
        .first();
      if (bySym) return bySym;
    }

    // 3. Fallback: Search key
    if (args.searchKey) {
      const byKey = await ctx.db
        .query("stockPriceCache")
        .withIndex("by_search_key", (q) => q.eq("searchKey", args.searchKey))
        .first();
      if (byKey) return byKey;
    }

    return null;
  },
});

/**
 * Inserts or updates an authentic stock quote into the stockPriceCache table.
 * Indexes and addresses each stock by its unique ISIN and resolved Ticker.NS / Ticker.BO.
 */
export const internalUpsertStockPriceCache = internalMutation({
  args: {
    isin: v.optional(v.string()),
    symbol: v.string(),
    name: v.string(),
    price: v.number(),
    prevClose: v.optional(v.number()),
    change: v.optional(v.number()),
    changePercent: v.optional(v.number()),
    searchKey: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // 1. Check if record with this unique ISIN already exists
    if (args.isin) {
      const existing = await ctx.db
        .query("stockPriceCache")
        .withIndex("by_isin", (q) => q.eq("isin", args.isin!))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          symbol: args.symbol || existing.symbol,
          name: args.name || existing.name,
          price: args.price,
          prevClose: args.prevClose ?? existing.prevClose,
          change: args.change ?? existing.change,
          changePercent: args.changePercent ?? existing.changePercent,
          searchKey: args.searchKey || existing.searchKey,
          lastFetchedAt: now,
        });
        return existing._id;
      }
    }

    // 2. Check by symbol
    if (args.symbol) {
      const existing = await ctx.db
        .query("stockPriceCache")
        .withIndex("by_symbol", (q) => q.eq("symbol", args.symbol))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          isin: args.isin || existing.isin,
          name: args.name || existing.name,
          price: args.price,
          prevClose: args.prevClose ?? existing.prevClose,
          change: args.change ?? existing.change,
          changePercent: args.changePercent ?? existing.changePercent,
          searchKey: args.searchKey || existing.searchKey,
          lastFetchedAt: now,
        });
        return existing._id;
      }
    }

    // 3. Check by searchKey
    if (args.searchKey) {
      const existingByKey = await ctx.db
        .query("stockPriceCache")
        .withIndex("by_search_key", (q) => q.eq("searchKey", args.searchKey))
        .first();
      if (existingByKey) {
        await ctx.db.patch(existingByKey._id, {
          isin: args.isin || existingByKey.isin,
          symbol: args.symbol || existingByKey.symbol,
          name: args.name || existingByKey.name,
          price: args.price,
          prevClose: args.prevClose ?? existingByKey.prevClose,
          change: args.change ?? existingByKey.change,
          changePercent: args.changePercent ?? existingByKey.changePercent,
          lastFetchedAt: now,
        });
        return existingByKey._id;
      }
    }

    return await ctx.db.insert("stockPriceCache", {
      isin: args.isin,
      symbol: args.symbol,
      name: args.name,
      price: args.price,
      prevClose: args.prevClose,
      change: args.change,
      changePercent: args.changePercent,
      searchKey: args.searchKey,
      lastFetchedAt: now,
    });
  },
});

/**
 * Public query to read cached stock price without hitting external APIs.
 * Supports query by ISIN, symbol, or holding name.
 */
export const getCachedStockPrice = query({
  args: {
    isin: v.optional(v.string()),
    symbol: v.optional(v.string()),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.isin) {
      const byIsin = await ctx.db
        .query("stockPriceCache")
        .withIndex("by_isin", (q) => q.eq("isin", args.isin!))
        .first();
      if (byIsin) return byIsin;
    }
    const key = normalizeStockSearchKey(args.name);
    if (args.symbol) {
      const bySym = await ctx.db
        .query("stockPriceCache")
        .withIndex("by_symbol", (q) => q.eq("symbol", args.symbol!))
        .first();
      if (bySym) return bySym;
    }
    if (key) {
      const byKey = await ctx.db
        .query("stockPriceCache")
        .withIndex("by_search_key", (q) => q.eq("searchKey", key))
        .first();
      if (byKey) return byKey;
    }
    return null;
  },
});

/**
 * Purges inactive stock cache records older than 30 days.
 */
export const internalPurgeStaleStockCache = internalMutation({
  args: {
    olderThanDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.olderThanDays ?? 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const stale = await ctx.db
      .query("stockPriceCache")
      .withIndex("by_last_fetched", (q) => q.lt("lastFetchedAt", cutoff))
      .take(100);
    let purged = 0;
    for (const item of stale) {
      await ctx.db.delete(item._id);
      purged++;
    }
    return { purged };
  },
});

/**
 * Primary Stock & Equity Price Gateway:
 * - When Indian stock market is OPEN (09:15 - 15:30 IST Mon-Fri):
 *   - Cache TTL is strictly 35 seconds (35,000 ms) to maintain accuracy and prevent API rate limiting.
 *   - If cached quote is < 35 seconds old, returns immediately from DB in ~5ms (ZERO external API calls).
 *   - If >= 35 seconds old, fetches live Yahoo Finance quote and upserts stockPriceCache.
 * - When Indian stock market is CLOSED (Weekends, Public Holidays, or Non-Market Hours):
 *   - Stock exchanges do NOT trade; prices are static at the previous closing price / LTP.
 *   - If a cached record exists, returns the cached closing price directly (ZERO API calls).
 *   - If no cached record exists yet, fetches once from Yahoo Finance to get the official closing price and caches it.
 * - If external API fails, falls back gracefully to cached price.
 */
async function getOrFetchStockPriceWithCache(
  ctx: any,
  name: string,
  options?: { force?: boolean; notes?: string; knownIsin?: string; knownTicker?: string }
): Promise<{ price: number; prevClose?: number; symbol?: string; isin?: string; isCached?: boolean } | null> {
  const combined = `${name} ${options?.notes || ""}`;
  const resolvedIsin = options?.knownIsin || extractStockIsin(combined) || extractSecurityIsin(combined);
  const searchKey = normalizeStockSearchKey(name);
  const marketStatus = getIndianMarketStatus();
  const now = Date.now();

  // 1. Check persistent Stock Cache DB (queries by isin, symbol, or searchKey)
  const cached: any = await ctx.runQuery(internal.investments.internalGetCachedStockPrice, {
    isin: resolvedIsin,
    symbol: options?.knownTicker || name.trim().toUpperCase(),
    searchKey,
  });

  // Self-healing: if cached record exists but was missing isin, and we now have resolvedIsin,
  // update the cache record in the DB!
  if (cached && !cached.isin && resolvedIsin) {
    await ctx.runMutation(internal.investments.internalUpsertStockPriceCache, {
      isin: resolvedIsin,
      symbol: cached.symbol || options?.knownTicker || name.trim().toUpperCase(),
      name: cached.name || name,
      price: cached.price,
      prevClose: cached.prevClose,
      change: cached.change,
      changePercent: cached.changePercent,
      searchKey: cached.searchKey || searchKey,
    });
    cached.isin = resolvedIsin;
  }

  const latestCloseTime = getLatestMarketCloseTimeMs();

  // 2. Closed market logic: weekends, holidays, or outside 09:15 - 15:30 IST.
  // Exchanges are closed; official closing prices are static and immutable.
  // Once recorded after today's 15:30 IST close, the data will NOT change until the next trading day at 09:15 AM IST.
  // On weekends and public holidays, the market is closed/leave; previous session close remains locked.
  // 2. Closed market logic: weekends, holidays, or outside 09:15 - 15:30 IST.
  // Exchanges are closed; official closing prices are static and immutable.
  // Once recorded after today's 15:30 IST close, the data will NOT change until the next trading day at 09:15 AM IST.
  if (!marketStatus.isOpen) {
    if (!options?.force && cached && cached.price > 0 && cached.lastFetchedAt >= latestCloseTime) {
      return {
        price: cached.price,
        prevClose: cached.prevClose,
        symbol: cached.symbol,
        isin: cached.isin || resolvedIsin,
        isCached: true,
      };
    }
    // Closing price not recorded yet after 3:30 PM: fetch once and freeze it
    const quote = await fetchStockQuote(name, options?.notes, resolvedIsin, options?.knownTicker);
    if (quote && quote.price > 0) {
      const finalIsin = quote.isin || resolvedIsin;
      await ctx.runMutation(internal.investments.internalUpsertStockPriceCache, {
        isin: finalIsin,
        symbol: quote.symbol || name.trim().toUpperCase(),
        name,
        price: quote.price,
        prevClose: quote.prevClose,
        searchKey,
      });
      return { ...quote, isin: finalIsin, isCached: false };
    }
    return cached && cached.price > 0
      ? { price: cached.price, prevClose: cached.prevClose, symbol: cached.symbol, isin: cached.isin || resolvedIsin, isCached: true }
      : null;
  }

  // 3. Open market logic (09:15 - 15:30 IST Mon-Fri): 45-second live API refresh feature.
  const THROTTLE_MS = 45 * 1000;
  if (!options?.force && marketStatus.isOpen && cached && cached.price > 0 && now - cached.lastFetchedAt < THROTTLE_MS) {
    return {
      price: cached.price,
      prevClose: cached.prevClose,
      symbol: cached.symbol,
      isin: cached.isin || resolvedIsin,
      isCached: true,
    };
  }

  // 4. Cache expired (>= 45s), force requested, missing, or pre-close: fetch fresh authentic quote from Yahoo
  const quote = await fetchStockQuote(name, options?.notes, resolvedIsin, options?.knownTicker);
  if (quote && quote.price > 0) {
    const finalIsin = quote.isin || resolvedIsin;
    await ctx.runMutation(internal.investments.internalUpsertStockPriceCache, {
      isin: finalIsin,
      symbol: quote.symbol || name.trim().toUpperCase(),
      name,
      price: quote.price,
      prevClose: quote.prevClose,
      searchKey,
    });
    return { ...quote, isin: finalIsin, isCached: false };
  }

  // Fallback to existing cached quote if network failed
  if (cached && cached.price > 0) {
    return {
      price: cached.price,
      prevClose: cached.prevClose,
      symbol: cached.symbol,
      isin: cached.isin || resolvedIsin,
      isCached: true,
    };
  }

  return null;
}

export const syncLiveMarketPrices = action({
  args: {
    userId: v.optional(v.id("users")),
    investmentIds: v.optional(v.array(v.id("investments"))),
    force: v.optional(v.boolean()),
    assetTypes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    let userId = args.userId;
    if (!userId) {
      userId = (await getAuthUserId(ctx)) ?? undefined;
    }

    if (args.investmentIds && args.investmentIds.length === 0) {
      return { success: true, count: 0, updates: [] };
    }

    const allInvestments: any[] = await ctx.runQuery(
      internal.investments.internalListInvestments,
      { userId, investmentIds: args.investmentIds }
    );
    if (!allInvestments || allInvestments.length === 0) {
      return { success: true, count: 0, updates: [] };
    }

    const marketStatus = getIndianMarketStatus();
    const isMktOpen = marketStatus.isOpen; // 9:15 AM - 3:30 PM IST on regular trading weekdays
    const now = Date.now();

    // 1. Build deduplicated tasks for unique price targets
    interface PriceTask {
      key: string;
      assetType: string;
      name: string;
      notes?: string;
      isin?: string;
      schemeCode?: number;
      ticker?: string;
    }

    const taskMap = new Map<string, PriceTask>();

    for (const inv of allInvestments) {
      const at = inv.assetType || "";
      if (at === "fd_rd" || at === "ppf_epf" || at === "real_estate" || at === "other") {
        continue;
      }
      if (args.assetTypes && args.assetTypes.length > 0 && !args.assetTypes.includes(at)) {
        continue;
      }
      const isInvested =
        (inv.investedAmount && inv.investedAmount > 0) ||
        (inv.units && inv.units > 0) ||
        (inv.currentValue && inv.currentValue > 0);
      if (!isInvested) {
        continue;
      }

      const combined = `${inv.name} ${inv.notes || ""}`;
      const detectedIsin = extractSecurityIsin(combined);
      const resolvedIsin = inv.isin || detectedIsin;
      const resolvedSchemeCode = inv.schemeCode;
      const resolvedTicker = inv.ticker;

      let taskKey = "";
      if (at === "mutual_fund") {
        taskKey = `mf:${resolvedIsin || (resolvedSchemeCode ? `code_${resolvedSchemeCode}` : normalizeMfSearchKey(inv.name))}`;
      } else if (at === "crypto") {
        taskKey = `crypto:${inv.name.trim().toLowerCase()}`;
      } else if (at === "gold") {
        const isSgbOrDigital = /\b(sgb|sovereign|bond|digi|digital)\b/i.test(inv.name);
        taskKey = isSgbOrDigital ? `sgb:${inv.name}` : `gold:${resolvedIsin || normalizeStockSearchKey(inv.name)}`;
      } else {
        taskKey = `stock:${resolvedIsin || resolvedTicker || normalizeStockSearchKey(inv.name)}`;
      }

      if (!taskMap.has(taskKey)) {
        taskMap.set(taskKey, {
          key: taskKey,
          assetType: at,
          name: inv.name,
          notes: inv.notes,
          isin: resolvedIsin,
          schemeCode: resolvedSchemeCode,
          ticker: resolvedTicker,
        });
      }
    }

    // 2. Fetch prices in parallel for deduplicated assets
    const taskResults = new Map<string, {
      livePrice: number | null;
      resolvedSchemeCode?: number;
      resolvedIsin?: string;
      resolvedTicker?: string;
    }>();

    const taskList = Array.from(taskMap.values());
    await Promise.all(
      taskList.map(async (task) => {
        try {
          let livePrice: number | null = null;
          let resolvedSchemeCode = task.schemeCode;
          let resolvedIsin = task.isin;
          let resolvedTicker = task.ticker;

          if (task.assetType === "mutual_fund") {
            const mf = await getOrFetchMfNavWithCache(ctx, task.name, task.notes, {
              force: args.force,
              knownSchemeCode: resolvedSchemeCode,
              knownIsin: resolvedIsin,
            });
            if (mf && mf.nav > 0) {
              livePrice = mf.nav;
              if (mf.schemeCode && !resolvedSchemeCode) resolvedSchemeCode = mf.schemeCode;
              if (mf.isin && !resolvedIsin) resolvedIsin = mf.isin;
            } else {
              // Universal dynamic fallback: if not in AMFI (e.g. an ETF entered under mutual_fund),
              // resolve via Yahoo Finance!
              const stk = await getOrFetchStockPriceWithCache(ctx, task.name, {
                force: args.force,
                notes: task.notes,
                knownIsin: resolvedIsin,
                knownTicker: resolvedTicker,
              });
              if (stk && stk.price > 0) {
                livePrice = stk.price;
                if (stk.symbol) resolvedTicker = stk.symbol;
                if (stk.isin && !resolvedIsin) resolvedIsin = stk.isin;
              }
            }
          } else if (task.assetType === "crypto") {
            const cry = await fetchCryptoPrice(task.name);
            if (cry && cry.price > 0) {
              livePrice = cry.price;
            }
          } else if (task.assetType === "gold") {
            const isSgbOrDigital = /\b(sgb|sovereign|bond|digi|digital)\b/i.test(task.name);
            if (!isSgbOrDigital) {
              const stk = await getOrFetchStockPriceWithCache(ctx, task.name, {
                force: args.force,
                notes: task.notes,
                knownIsin: resolvedIsin,
                knownTicker: resolvedTicker,
              });
              if (stk && stk.price > 0) {
                livePrice = stk.price;
                if (stk.symbol) resolvedTicker = stk.symbol;
                if (stk.isin && !resolvedIsin) resolvedIsin = stk.isin;
              } else {
                const mf = await getOrFetchMfNavWithCache(ctx, task.name, task.notes, {
                  force: args.force,
                  knownSchemeCode: resolvedSchemeCode,
                  knownIsin: resolvedIsin,
                });
                if (mf && mf.nav > 0) {
                  livePrice = mf.nav;
                  if (mf.schemeCode && !resolvedSchemeCode) resolvedSchemeCode = mf.schemeCode;
                  if (mf.isin && !resolvedIsin) resolvedIsin = mf.isin;
                }
              }
            }
          } else {
            const stk = await getOrFetchStockPriceWithCache(ctx, task.name, {
              force: args.force,
              notes: task.notes,
              knownIsin: resolvedIsin,
              knownTicker: resolvedTicker,
            });
            if (stk && stk.price > 0) {
              livePrice = stk.price;
              if (stk.symbol) resolvedTicker = stk.symbol;
              if (stk.isin && !resolvedIsin) resolvedIsin = stk.isin;
            } else {
              // Universal dynamic fallback: if not on Yahoo (e.g. mutual fund categorized under stocks),
              // resolve via AMFI!
              const mf = await getOrFetchMfNavWithCache(ctx, task.name, task.notes, {
                force: args.force,
                knownSchemeCode: resolvedSchemeCode,
                knownIsin: resolvedIsin,
              });
              if (mf && mf.nav > 0) {
                livePrice = mf.nav;
                if (mf.schemeCode && !resolvedSchemeCode) resolvedSchemeCode = mf.schemeCode;
                if (mf.isin && !resolvedIsin) resolvedIsin = mf.isin;
              }
            }
          }

          taskResults.set(task.key, {
            livePrice,
            resolvedSchemeCode,
            resolvedIsin,
            resolvedTicker,
          });
        } catch (err) {
          console.warn(`[SyncLiveMarket] Error fetching price for ${task.name}:`, err);
        }
      })
    );

    // 3. Map results back to all investments and prepare batch updates
    const updates: {
      id: any;
      currentValue: number;
      currentPrice?: number;
      units?: number;
      schemeCode?: number;
      isin?: string;
      ticker?: string;
      manualPrice?: boolean;
      manualPriceUpdatedAt?: number;
    }[] = [];

    for (const inv of allInvestments) {
      const at = inv.assetType || "";
      if (at === "fd_rd" || at === "ppf_epf" || at === "real_estate" || at === "other") {
        continue;
      }

      const combined = `${inv.name} ${inv.notes || ""}`;
      const detectedIsin = extractSecurityIsin(combined);
      const resolvedIsin = inv.isin || detectedIsin;
      const resolvedSchemeCode = inv.schemeCode;
      const resolvedTicker = inv.ticker;

      let taskKey = "";
      if (at === "mutual_fund") {
        taskKey = `mf:${resolvedIsin || (resolvedSchemeCode ? `code_${resolvedSchemeCode}` : normalizeMfSearchKey(inv.name))}`;
      } else if (at === "crypto") {
        taskKey = `crypto:${inv.name.trim().toLowerCase()}`;
      } else if (at === "gold") {
        const isSgbOrDigital = /\b(sgb|sovereign|bond|digi|digital)\b/i.test(inv.name);
        taskKey = isSgbOrDigital ? `sgb:${inv.name}` : `gold:${resolvedIsin || normalizeStockSearchKey(inv.name)}`;
      } else {
        taskKey = `stock:${resolvedIsin || resolvedTicker || normalizeStockSearchKey(inv.name)}`;
      }

      const res = taskResults.get(taskKey);
      if (!res || res.livePrice === null || res.livePrice <= 0) {
        continue;
      }

      const now = Date.now();
      const livePrice = res.livePrice;

      // ── Intelligent 1-Day & Live Truth Reconciler ──
      // Requirement:
      // 1. "if its correct ok, but if its wrong then immediately correctly fetch the correct and true live price NAV or CP and update that"
      // 2. "also that price is for 1 day only and the next day or if their is a live change in price then it must update only the correct and true price for NAV or CP"
      let shouldApplyLivePrice = true;
      let clearManualFlag = false;

      if (inv.manualPrice && !args.force) {
        const manualAgeMs = inv.manualPriceUpdatedAt ? now - inv.manualPriceUpdatedAt : now - (inv.updatedAt || inv.createdAt);
        const todayIst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
        const manualDateIst = inv.manualPriceUpdatedAt
          ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(inv.manualPriceUpdatedAt)
          : null;
        const isNextDay = manualAgeMs >= 18 * 60 * 60 * 1000 || (manualDateIst !== null && manualDateIst !== todayIst);

        if (isNextDay) {
          // Manual price expires after 1 day: next day / new cycle updates to authentic live price
          shouldApplyLivePrice = true;
          clearManualFlag = true;
        } else if (inv.currentPrice && inv.currentPrice > 0) {
          // Same day validation: compare entered price with verified live rate
          const deviationRatio = Math.abs(livePrice - inv.currentPrice) / livePrice;
          if (deviationRatio > 0.005) {
            // Entered price was wrong or divergent -> immediately correct to the true live price
            shouldApplyLivePrice = true;
            clearManualFlag = true;
          } else {
            // Price is correct! Keep it for today, but ensure verified official metadata is attached
            shouldApplyLivePrice = false;
          }
        }
      }

      const finalSchemeCode = res.resolvedSchemeCode ?? inv.schemeCode;
      const finalIsin = res.resolvedIsin ?? inv.isin;
      const finalTicker = res.resolvedTicker ?? inv.ticker;

      if (!shouldApplyLivePrice) {
        // Price is correct for today; if official identifiers were resolved, update them
        const identifierChanged =
          (finalSchemeCode !== undefined && finalSchemeCode !== inv.schemeCode) ||
          (finalIsin !== undefined && finalIsin !== inv.isin) ||
          (finalTicker !== undefined && finalTicker !== inv.ticker);
        if (identifierChanged) {
          updates.push({
            id: inv._id,
            currentValue: inv.currentValue,
            currentPrice: inv.currentPrice,
            units: inv.units,
            schemeCode: finalSchemeCode,
            isin: finalIsin,
            ticker: finalTicker,
            manualPrice: true,
            manualPriceUpdatedAt: inv.manualPriceUpdatedAt,
          });
        }
        continue;
      }

      // Sanity Guard: Only reject wild price swings if unverified and not a forced sync
      const hasVerifiedId = Boolean(finalIsin || finalSchemeCode || (finalTicker && finalTicker.includes(".")));
      if (!args.force && !hasVerifiedId && inv.currentPrice && inv.currentPrice > 0) {
        const priceRatio = livePrice / inv.currentPrice;
        if (priceRatio < 0.25 || priceRatio > 4.0) {
          console.warn(`[SyncLiveMarket] Rejecting wild unverified price swing for ${inv.name}: existing=${inv.currentPrice}, live=${livePrice}`);
          continue;
        }
      }

      const hasQty = inv.units && inv.units > 0;
      const hasBuyBasis = inv.investedAmount > 0 && inv.buyPrice && inv.buyPrice > 0;
      const hasPriceRatio = inv.currentPrice && inv.currentPrice > 0 && inv.currentValue > 0;

      let updatedVal = inv.currentValue;
      let newUnits: number | undefined = inv.units;
      if (hasQty) {
        updatedVal = Math.round(inv.units * livePrice * 100) / 100;
      } else if (hasBuyBasis) {
        const derivedUnits = Math.round((inv.investedAmount / inv.buyPrice) * 10000) / 10000;
        newUnits = derivedUnits;
        updatedVal = Math.round(derivedUnits * livePrice * 100) / 100;
      } else if (hasPriceRatio) {
        const ratio = livePrice / inv.currentPrice;
        updatedVal = Math.round(inv.currentValue * ratio * 100) / 100;
        if (!newUnits && inv.currentValue > 0 && inv.currentPrice > 0) {
          newUnits = Math.round((inv.currentValue / inv.currentPrice) * 10000) / 10000;
        }
      } else {
        if (!newUnits && inv.investedAmount > 0 && livePrice > 0) {
          newUnits = Math.round((inv.investedAmount / livePrice) * 10000) / 10000;
        }
        updatedVal = newUnits ? Math.round(newUnits * livePrice * 100) / 100 : (inv.currentValue > 0 ? inv.currentValue : inv.investedAmount);
      }

      const valDiff = Math.abs(updatedVal - inv.currentValue);
      const priceDiff = Math.abs(livePrice - (inv.currentPrice || 0));
      const unitsDiff = newUnits !== inv.units;
      const manualCleared = clearManualFlag && inv.manualPrice;

      const identifierChanged =
        (finalSchemeCode !== undefined && finalSchemeCode !== inv.schemeCode) ||
        (finalIsin !== undefined && finalIsin !== inv.isin) ||
        (finalTicker !== undefined && finalTicker !== inv.ticker);

      if (valDiff > 0.01 || priceDiff > 0.0001 || unitsDiff || identifierChanged || manualCleared) {
        updates.push({
          id: inv._id,
          currentValue: updatedVal,
          currentPrice: livePrice,
          units: newUnits,
          schemeCode: finalSchemeCode,
          isin: finalIsin,
          ticker: finalTicker,
          manualPrice: clearManualFlag ? false : (args.force ? false : inv.manualPrice),
          manualPriceUpdatedAt: clearManualFlag ? undefined : inv.manualPriceUpdatedAt,
        });
      }
    }

    if (updates.length > 0) {
      await ctx.runMutation(internal.investments.internalBatchUpdatePrices, { userId, updates });
    }

    return { success: true, count: updates.length, updates };
  },
});

/**
 * Migration & Verification Action:
 * Iterates all user investments, ensures ISIN, schemeCode, and ticker are populated,
 * refreshes stockPriceCache and mfNavCache, and returns detailed metrics.
 */
export const migrateAndRefreshCacheDb = action({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // 1. Sync live market prices for all investments across all users
    const syncRes = await ctx.runAction(api.investments.syncLiveMarketPrices, {
      force: args.force ?? true,
    });

    const stockCache: any[] = await ctx.runQuery(internal.investments.internalListAllStockCache, {});
    const mfCache: any[] = await ctx.runQuery(internal.investments.internalListAllMfCache, {});
    const allInvestments: any[] = await ctx.runQuery(internal.investments.internalListInvestments, {});

    return {
      success: true,
      totalInvestments: allInvestments.length,
      updatedHoldings: syncRes.count,
      stockCacheEntries: stockCache.length,
      stockCacheWithIsin: stockCache.filter((s) => Boolean(s.isin)).length,
      mfCacheEntries: mfCache.length,
      mfCacheWithIsin: mfCache.filter((m) => Boolean(m.isin)).length,
    };
  },
});

export const fetchLivePrice = action({
  args: {
    name: v.string(),
    assetType: v.string(),
    notes: v.optional(v.string()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { name, assetType, notes, force } = args;
    if (!name || name.trim().length < 2) return null;

    if (assetType === "mutual_fund") {
      const mf = await getOrFetchMfNavWithCache(ctx, name, notes, { force });
      if (mf && mf.nav > 0) {
        return { price: mf.nav, symbol: mf.schemeName, date: mf.date, prevClose: mf.prevNav, schemeCode: mf.schemeCode, isin: mf.isin };
      }
      // Universal dynamic fallback for ETFs or funds searched under mutual_fund
      return await getOrFetchStockPriceWithCache(ctx, name, { force, notes });
    }

    if (assetType === "crypto") {
      return await fetchCryptoPrice(name);
    }

    if (assetType === "gold") {
      const isSgbOrDigital = /\b(sgb|sovereign|bond|digi|digital)\b/i.test(name);
      if (!isSgbOrDigital) {
        // 1. Try stock cache first for ETFs (GOLDBEES, SILVERBEES, GOLDAXIS, SILVERIETF, etc.)
        const stk = await getOrFetchStockPriceWithCache(ctx, name, { force, notes });
        if (stk && stk.price > 0) return stk;

        // 2. Try AMFI Cache DB for Gold/Silver mutual funds
        const mf = await getOrFetchMfNavWithCache(ctx, name, notes, { force });
        if (mf && mf.nav > 0) {
          return { price: mf.nav, symbol: mf.schemeName, date: mf.date, prevClose: mf.prevNav, schemeCode: mf.schemeCode, isin: mf.isin };
        }
      }
      return null;
    }

    // Stocks, SGBs, Commodities: Uses live cache or static closing price
    const stk = await getOrFetchStockPriceWithCache(ctx, name, { force, notes });
    if (stk && stk.price > 0) return stk;

    // Dynamic fallback for Mutual Funds searched under stocks
    const mf = await getOrFetchMfNavWithCache(ctx, name, notes, { force });
    if (mf && mf.nav > 0) {
      return { price: mf.nav, symbol: mf.schemeName, date: mf.date, prevClose: mf.prevNav, schemeCode: mf.schemeCode, isin: mf.isin };
    }
    return null;
  },
});

/**
 * Universal Market Search:
 * Autocompletes ANY mutual fund from AMFI and ANY stock from the Indian market (NSE & BSE).
 * Returns real-time quotes, latest NAVs, official schemeCodes, and ticker symbols.
 */
export const searchMarketAssets = action({
  args: {
    query: v.string(),
    assetType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const q = args.query.trim();
    if (!q || q.length < 2) return { mutualFunds: [], stocks: [] };

    const results: {
      mutualFunds: Array<{
        schemeCode: number;
        schemeName: string;
        nav?: number;
        date?: string;
        isin?: string;
      }>;
      stocks: Array<{
        symbol: string;
        name: string;
        price?: number;
        prevClose?: number;
        exchange?: string;
        change?: number;
        changePercent?: number;
      }>;
    } = { mutualFunds: [], stocks: [] };

    const shouldSearchMf = !args.assetType || args.assetType === "mutual_fund";
    const shouldSearchStocks = !args.assetType || args.assetType === "stocks";

    // 1. Mutual Funds Search (AMFI Universe - 40,000+ schemes)
    if (shouldSearchMf) {
      try {
        const clean = q
          .replace(/^(name\s+of\s+(the\s+)?scheme|scheme\s*name|scheme)\s*[:：]\s*/i, "")
          .replace(/[\.\(\)₹\$\[\]\/\\-]/g, " ")
          .replace(/\s{2,}/g, " ")
          .trim();

        const scoredEntries: Array<{ schemeCode: number; schemeName: string; nav?: number; date?: string; isin?: string; score: number }> = [];

        // 1A. Check in-memory AMFI table if available
        const amfiTable = await getAmfiOfficialNavTable();
        if (amfiTable) {
          const isinUpper = q.toUpperCase();
          if (amfiTable.isinMap.has(isinUpper)) {
            const e = amfiTable.isinMap.get(isinUpper)!;
            scoredEntries.push({
              schemeCode: e.code,
              schemeName: e.name,
              nav: e.nav,
              date: e.date,
              isin: e.isin,
              score: 500,
            });
          }

          const codeNum = parseInt(q, 10);
          if (!isNaN(codeNum) && amfiTable.codeMap.has(codeNum)) {
            const e = amfiTable.codeMap.get(codeNum)!;
            scoredEntries.push({
              schemeCode: e.code,
              schemeName: e.name,
              nav: e.nav,
              date: e.date,
              isin: e.isin,
              score: 500,
            });
          }

          for (const item of amfiTable.entries) {
            const score = scoreMfCandidate({ schemeCode: item.code, schemeName: item.name }, clean);
            if (score >= 40) {
              scoredEntries.push({
                schemeCode: item.code,
                schemeName: item.name,
                nav: item.nav,
                date: item.date,
                isin: item.isin,
                score,
              });
              if (scoredEntries.length > 25) break;
            }
          }
        }

        // 1B. Query official MFAPI search endpoint for broad coverage
        if (scoredEntries.length < 5) {
          try {
            const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(clean)}`, {
              headers: STANDARD_HEADERS,
              signal: AbortSignal.timeout(3500),
            });
            if (res.ok) {
              const list: any[] = await res.json();
              if (Array.isArray(list)) {
                for (const item of list.slice(0, 10)) {
                  if (!scoredEntries.some((s) => s.schemeCode === item.schemeCode)) {
                    const score = scoreMfCandidate(item, clean);
                    scoredEntries.push({
                      schemeCode: item.schemeCode,
                      schemeName: item.schemeName,
                      score,
                    });
                  }
                }
              }
            }
          } catch {}
        }

        scoredEntries.sort((a, b) => b.score - a.score);
        const topMf = scoredEntries.slice(0, 6);

        // Fetch /latest NAV for top candidates lacking nav
        await Promise.all(
          topMf.map(async (item) => {
            if (!item.nav) {
              try {
                const latestRes = await fetch(`https://api.mfapi.in/mf/${item.schemeCode}/latest`, {
                  headers: STANDARD_HEADERS,
                  signal: AbortSignal.timeout(2500),
                });
                if (latestRes.ok) {
                  const details: any = await latestRes.json();
                  const latest = details?.data?.[0];
                  if (latest?.nav) {
                    item.nav = parseFloat(latest.nav);
                    item.date = latest.date;
                    item.isin = details.meta?.isin_growth || item.isin;
                  }
                }
              } catch {}
            }
          })
        );

        results.mutualFunds = topMf.map((m) => ({
          schemeCode: m.schemeCode,
          schemeName: m.schemeName,
          nav: m.nav,
          date: m.date,
          isin: m.isin,
        }));
      } catch (err) {
        console.warn("[SearchMarketAssets] MF search error:", err);
      }
    }

    // 2. Indian Stocks Search (NSE & BSE)
    if (shouldSearchStocks) {
      try {
        const clean = q.trim().toUpperCase();
        let yRes: Response | null = null;
        try {
          yRes = await fetch(
            `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(clean)}&quotesCount=10`,
            { headers: STANDARD_HEADERS, signal: AbortSignal.timeout(3500) }
          );
        } catch {
          try {
            yRes = await fetch(
              `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(clean)}&quotesCount=10`,
              { headers: STANDARD_HEADERS, signal: AbortSignal.timeout(3500) }
            );
          } catch {}
        }

        if (yRes && yRes.ok) {
          const yData: any = await yRes.json();
          const quotes: any[] = yData?.quotes || [];

          // Filter for Indian equities or ETFs
          const indianQuotes = quotes.filter((item) => {
            if (!item.symbol || item.symbol.startsWith("^") || item.symbol.includes("=F")) return false;
            const sym = item.symbol.toUpperCase();
            return (
              sym.endsWith(".NS") ||
              sym.endsWith(".BO") ||
              item.exchange === "NSI" ||
              item.exchange === "BOM" ||
              item.quoteType === "EQUITY" ||
              item.quoteType === "ETF"
            );
          });

          // Bare ticker auto-injection (e.g. ZOMATO, TATAMOTORS, INFY, RELIANCE)
          if (/^[A-Z0-9]{2,14}$/.test(clean)) {
            if (!indianQuotes.some((item) => item.symbol.toUpperCase().startsWith(clean))) {
              indianQuotes.unshift({
                symbol: `${clean}.NS`,
                shortname: clean,
                exchange: "NSI",
              });
            }
          }

          const topStocks = indianQuotes.slice(0, 5);

          // Fetch price for top stocks in parallel
          await Promise.all(
            topStocks.map(async (stk) => {
              try {
                const sym = stk.symbol;
                let cRes: Response | null = null;
                try {
                  cRes = await fetch(
                    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
                    { headers: STANDARD_HEADERS, signal: AbortSignal.timeout(2500) }
                  );
                } catch {
                  try {
                    cRes = await fetch(
                      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
                      { headers: STANDARD_HEADERS, signal: AbortSignal.timeout(2500) }
                    );
                  } catch {}
                }
                if (cRes && cRes.ok) {
                  const cData: any = await cRes.json();
                  const meta = cData?.chart?.result?.[0]?.meta;
                  if (meta && typeof meta.regularMarketPrice === "number") {
                    stk.price = meta.regularMarketPrice;
                    stk.prevClose = meta.previousClose || meta.chartPreviousClose;
                    const change =
                      typeof meta.regularMarketChange === "number"
                        ? meta.regularMarketChange
                        : meta.regularMarketPrice - (stk.prevClose || meta.regularMarketPrice);
                    stk.change = change;
                    stk.changePercent =
                      stk.prevClose && stk.prevClose > 0
                        ? Number(((change / stk.prevClose) * 100).toFixed(2))
                        : 0;
                  }
                }
              } catch {}
            })
          );

          results.stocks = topStocks.map((s) => ({
            symbol: s.symbol.toUpperCase(),
            name: s.shortname || s.longname || s.symbol,
            price: s.price,
            prevClose: s.prevClose,
            change: s.change,
            changePercent: s.changePercent,
            exchange: s.symbol.toUpperCase().endsWith(".NS")
              ? "NSE"
              : s.symbol.toUpperCase().endsWith(".BO")
              ? "BSE"
              : s.exchange || "NSE",
          }));
        }
      } catch (err) {
        console.warn("[SearchMarketAssets] Stock search error:", err);
      }
    }

    return results;
  },
});

export const getMarketIndices = action({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const indices = [
      { key: "nifty50", symbol: "^NSEI", name: "NIFTY 50" },
      { key: "sensex", symbol: "^BSESN", name: "SENSEX" },
    ];
    const marketStatus = getIndianMarketStatus();
    const now = Date.now();
    const INDEX_CACHE_TTL_MS = 45 * 1000; // 45 seconds during market hours
    const latestCloseTime = getLatestMarketCloseTimeMs();

    // 1. First, check if all indices can be served from persistent cache
    const cachedMap = new Map<string, any>();
    for (const idx of indices) {
      try {
        const cached: any = await ctx.runQuery(internal.investments.internalGetCachedStockPrice, {
          symbol: idx.symbol,
          searchKey: `__benchmark_index_${idx.key}__`,
        });
        if (cached && cached.price > 0) {
          cachedMap.set(idx.key, cached);
        }
      } catch { }
    }

    // If market closed and cache exists from AFTER latest session close (15:30 IST),
    // data will not change until the next trading day at 09:15 AM IST.
    if (!args.force && !marketStatus.isOpen) {
      const allClosedCached = indices.every((idx) => {
        const c = cachedMap.get(idx.key);
        return c && c.price > 0 && c.lastFetchedAt >= latestCloseTime;
      });
      if (allClosedCached) {
        return indices.map((idx) => {
          const c = cachedMap.get(idx.key)!;
          return {
            name: idx.name,
            symbol: idx.symbol,
            price: c.price,
            change: c.change || 0,
            changePercent: c.changePercent || 0,
            isPositive: (c.change || 0) >= 0,
          };
        });
      }
    }

    // If market open and cached < 45s, return cached index values
    if (!args.force && marketStatus.isOpen) {
      const allFresh = indices.every((idx) => {
        const c = cachedMap.get(idx.key);
        return c && c.price > 0 && now - c.lastFetchedAt < INDEX_CACHE_TTL_MS;
      });
      if (allFresh) {
        return indices.map((idx) => {
          const c = cachedMap.get(idx.key)!;
          return {
            name: idx.name,
            symbol: idx.symbol,
            price: c.price,
            change: c.change || 0,
            changePercent: c.changePercent || 0,
            isPositive: (c.change || 0) >= 0,
          };
        });
      }
    }

    // 2. Multi-tier Yahoo Finance + Official Exchange index resolver
    const fetchSingleIndex = async (idx: (typeof indices)[0]) => {
      try {
        const searchKey = `__benchmark_index_${idx.key}__`;
        const cached = cachedMap.get(idx.key);

        let livePrice: number | null = null;
        let liveChange = 0;
        let liveChangePct = 0;

        // Tier 1: Yahoo Finance chart API with desktop browser headers (query1 + query2 failover)
        let res: Response | null = null;
        try {
          res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(idx.symbol)}?interval=1d&range=1d`,
            { headers: STANDARD_HEADERS, signal: AbortSignal.timeout(4000) }
          );
        } catch {
          try {
            res = await fetch(
              `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(idx.symbol)}?interval=1d&range=1d`,
              { headers: STANDARD_HEADERS, signal: AbortSignal.timeout(4000) }
            );
          } catch {}
        }

        if (res && res.ok) {
          const d: any = await res.json();
          const meta = d?.chart?.result?.[0]?.meta;
          if (meta && typeof meta.regularMarketPrice === "number" && meta.regularMarketPrice > 0) {
            livePrice = meta.regularMarketPrice;
            if (typeof meta.regularMarketChange === "number" && !isNaN(meta.regularMarketChange)) {
              liveChange = meta.regularMarketChange;
            } else if (typeof meta.fulldayChange === "number" && !isNaN(meta.fulldayChange)) {
              liveChange = meta.fulldayChange;
            } else {
              const prev = meta.previousClose || meta.chartPreviousClose || livePrice;
              liveChange = livePrice - prev;
            }

            if (typeof meta.regularMarketChangePercent === "number" && !isNaN(meta.regularMarketChangePercent)) {
              liveChangePct = Number(meta.regularMarketChangePercent.toFixed(2));
            } else if (typeof meta.fulldayChangePercent === "number" && !isNaN(meta.fulldayChangePercent)) {
              liveChangePct = Number(meta.fulldayChangePercent.toFixed(2));
            } else {
              const prev = livePrice - liveChange;
              liveChangePct = prev > 0 ? Number(((liveChange / prev) * 100).toFixed(2)) : 0;
            }
          }
        }

        // Tier 2: Official exchange mobile feeds if Yahoo unavailable
        if (!livePrice) {
          if (idx.key === "sensex") {
            try {
              const bseRes = await fetch("https://m.bseindia.com/", {
                headers: STANDARD_HEADERS,
                signal: AbortSignal.timeout(3500),
              });
              if (bseRes.ok) {
                const html = await bseRes.text();
                const ltpMatch = html.match(/id="UcHeaderMenu1_sensexLtp"[^>]*>([^<]+)</);
                const chgMatch = html.match(/id="UcHeaderMenu1_sensexChange"[^>]*>([^<]+)</);
                const pctMatch = html.match(/id="UcHeaderMenu1_sensexPerChange"[^>]*>([^<]+)</);
                if (ltpMatch) {
                  const parsedPrice = parseFloat(ltpMatch[1].replace(/,/g, "").trim());
                  if (!isNaN(parsedPrice) && parsedPrice > 0) {
                    livePrice = parsedPrice;
                    liveChange = chgMatch ? parseFloat(chgMatch[1].replace(/[+,]/g, "").trim()) : 0;
                    liveChangePct = pctMatch ? parseFloat(pctMatch[1].replace(/[+%,]/g, "").trim()) : 0;
                  }
                }
              }
            } catch {}
          }
        }

        if (livePrice && livePrice > 0) {
          const roundedPrice = Math.round(livePrice * 100) / 100;
          const roundedChange = Math.round(liveChange * 100) / 100;
          const derivedPrevClose = Math.round((livePrice - liveChange) * 100) / 100;

          await ctx.runMutation(internal.investments.internalUpsertStockPriceCache, {
            symbol: idx.symbol,
            name: idx.name,
            price: roundedPrice,
            prevClose: derivedPrevClose,
            change: roundedChange,
            changePercent: liveChangePct,
            searchKey,
          });

          return {
            name: idx.name,
            symbol: idx.symbol,
            price: roundedPrice,
            change: roundedChange,
            changePercent: liveChangePct,
            isPositive: roundedChange >= 0,
          };
        }

        if (cached && cached.price > 0) {
          return {
            name: idx.name,
            symbol: idx.symbol,
            price: cached.price,
            change: cached.change || 0,
            changePercent: cached.changePercent || 0,
            isPositive: (cached.change || 0) >= 0,
          };
        }
      } catch (err) {
        console.warn(`[GetMarketIndices] Error fetching ${idx.name}:`, err);
      }
      return null;
    };

    const results = await Promise.all(indices.map(fetchSingleIndex));
    return results.filter(Boolean);
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
 * strictly created by identical duplicate file uploads or true accidental double inserts.
 * Safeguards: Never deletes user manual entries; only removes if identical batch/ISIN/folio/units.
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

    let removedCount = 0;
    const seen = new Map<string, (typeof holdings)[0]>();

    for (const holding of holdings) {
      // Never auto-deduplicate manually created holdings (holdings without importBatchId)
      if (!holding.importBatchId) continue;

      const folio = extractFolio(holding.notes || "");
      const isin = holding.isin || extractSecurityIsin(holding.notes || "");
      const unitsKey = holding.units ? Math.round(holding.units * 1000) / 1000 : 0;
      const amountKey = Math.round((holding.investedAmount || 0) * 100) / 100;

      // Deduplication key requires exact batch or exact ISIN+folio+units match
      const key = `${holding.importBatchId}_${isin || holding.name.trim().toLowerCase()}_${folio || ""}_${unitsKey}_${amountKey}`;

      if (seen.has(key)) {
        const existing = seen.get(key)!;
        const keepExisting = (existing.updatedAt || existing.createdAt || 0) >= (holding.updatedAt || holding.createdAt || 0);
        if (keepExisting) {
          await ctx.db.delete(holding._id);
        } else {
          await ctx.db.delete(existing._id);
          seen.set(key, holding);
        }
        removedCount++;
      } else {
        seen.set(key, holding);
      }
    }

    return { removedCount };
  },
});

/**
 * Verifies a holding against official AMFI or Yahoo Finance live API,
 * permanently locks in the verified price, schemeCode, and ISIN into the cache DB,
 * and recalculates portfolio current value with mathematical consistency.
 */
export const verifyAndCorrectHolding = action({
  args: {
    id: v.id("investments"),
    manualNav: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const items: any[] = await ctx.runQuery(internal.investments.internalListInvestments, {
      userId,
      investmentIds: [args.id],
    });
    const inv = items?.[0];
    if (!inv) {
      throw new Error("Holding not found or unauthorized");
    }

    const isMf = inv.assetType === "mutual_fund" || (inv.assetType === "gold" && /fund/i.test(inv.name));
    let targetPrice = args.manualNav;
    let verifiedSchemeCode = inv.schemeCode;
    let verifiedIsin = inv.isin;
    let verifiedTicker = inv.ticker;

    if (isMf) {
      // Query AMFI live API directly
      const amfi = await fetchMfNav(inv.name, inv.notes, inv.schemeCode, inv.isin);
      if (amfi && amfi.nav > 0) {
        if (!targetPrice) {
          targetPrice = amfi.nav;
        }
        verifiedSchemeCode = amfi.schemeCode || verifiedSchemeCode;
        verifiedIsin = amfi.isin || verifiedIsin;
      }
    } else {
      // Query Yahoo live quote
      const stk = await fetchStockQuote(inv.name, inv.notes, inv.isin, inv.ticker);
      if (stk && stk.price > 0) {
        if (!targetPrice) {
          targetPrice = stk.price;
        }
        verifiedTicker = stk.symbol || verifiedTicker;
        verifiedIsin = stk.isin || verifiedIsin;
      }
    }

    const finalPrice = targetPrice ?? inv.currentPrice;
    if (finalPrice && finalPrice > 0) {
      const finalUnits = inv.units && inv.units > 0 ? inv.units : 0;
      const finalValue = finalUnits > 0 ? Math.round(finalUnits * finalPrice * 100) / 100 : (inv.currentValue || inv.investedAmount);

      await ctx.runMutation(internal.investments.internalBatchUpdatePrices, {
        userId,
        updates: [
          {
            id: inv._id,
            currentPrice: finalPrice,
            currentValue: finalValue,
            schemeCode: verifiedSchemeCode,
            isin: verifiedIsin,
            ticker: verifiedTicker,
          },
        ],
      });

      if (isMf) {
        await ctx.runMutation(internal.investments.internalUpsertMfNavCache, {
          isin: verifiedIsin,
          schemeCode: verifiedSchemeCode || 0,
          schemeName: inv.name,
          nav: finalPrice,
          navDate: getLatestExpectedMfNavDate(),
          searchKey: normalizeMfSearchKey(inv.name),
        });
      } else {
        await ctx.runMutation(internal.investments.internalUpsertStockPriceCache, {
          isin: verifiedIsin,
          symbol: verifiedTicker || normalizeStockSearchKey(inv.name),
          name: inv.name,
          price: finalPrice,
          searchKey: normalizeStockSearchKey(inv.name),
        });
      }

      return {
        success: true,
        currentPrice: finalPrice,
        currentValue: finalValue,
        schemeCode: verifiedSchemeCode,
        isin: verifiedIsin,
        ticker: verifiedTicker,
      };
    }

    return { success: false, reason: "Could not verify price from live market API" };
  },
});

/**
 * 3:15 PM IST Market Ending Job (15:15 IST = 09:45 UTC, Mon-Fri):
 * Stage 1: Captures initial market close prices, updating indices and active user holdings in cache DB.
 * Marks today's status as pending in cache DB.
 */
export const internalSyncMarketClose315Job = internalAction({
  args: {},
  handler: async (ctx) => {
    const marketStatus = getIndianMarketStatus();
    if (marketStatus.isWeekend || marketStatus.isHoliday) {
      console.log(`[MarketClose 3:15 PM] Market closed today (${marketStatus.reason}). Skipping.`);
      return { skipped: true, reason: marketStatus.reason };
    }

    console.log("[MarketClose 3:15 PM] Stage 1: Updating cache DB with latest live market prices...");

    // 1. Sync benchmark indices into cache DB
    await ctx.runAction(api.investments.getMarketIndices, { force: true });

    // 2. Sync all users' active holdings into cache DB
    const res = await ctx.runAction(api.investments.syncLiveMarketPrices, { force: true });

    // 3. Store pending status for today so 3:25 PM can verify
    await ctx.runMutation(internal.investments.internalUpsertStockPriceCache, {
      symbol: "__MARKET_CLOSE_STATUS__",
      name: "PENDING_315",
      price: 0, // 0 = pending verification at 3:25 PM
      searchKey: `__market_close_${marketStatus.istDateStr}__`,
    });

    console.log(`[MarketClose 3:15 PM] Successfully updated cache DB with ${res.count || 0} holdings.`);
    return { success: true, count: res.count || 0 };
  },
});

/**
 * 3:25 PM IST Market Ending Verification Job (15:25 IST = 09:55 UTC, Mon-Fri):
 * Stage 2: Checks if live market API values match the values stored in cache DB.
 * If all values match: marks today's status as SETTLED (price = 1) so the 3:30 PM call is skipped!
 * If values differ: updates cache DB with newly fetched quotes and leaves status as 0 so 3:30 PM runs.
 */
export const internalSyncMarketClose325Job = internalAction({
  args: {},
  handler: async (ctx) => {
    const marketStatus = getIndianMarketStatus();
    if (marketStatus.isWeekend || marketStatus.isHoliday) {
      console.log(`[MarketClose 3:25 PM] Market closed today (${marketStatus.reason}). Skipping.`);
      return { skipped: true, reason: marketStatus.reason };
    }

    console.log("[MarketClose 3:25 PM] Stage 2: Checking if live API values match cache DB...");

    let pricesMoved = false;

    // 1. Compare fresh live benchmark indices with cache DB
    try {
      const freshIndices: any = await ctx.runAction(api.investments.getMarketIndices, { force: true });
      for (const fresh of freshIndices || []) {
        const key = fresh.symbol === "^BSESN" ? "sensex" : "nifty50";
        const cached: any = await ctx.runQuery(internal.investments.internalGetCachedStockPrice, {
          symbol: fresh.symbol,
          searchKey: `__benchmark_index_${key}__`,
        });
        if (typeof fresh?.price === "number" && fresh.price > 0 && cached?.price) {
          const diff = Math.abs(fresh.price - cached.price);
          if (diff > 0.5) {
            pricesMoved = true;
            break;
          }
        }
      }
    } catch {}

    // 2. If indices match, check sample of active user holdings against cache DB
    if (!pricesMoved) {
      try {
        const allInvestments: any[] = await ctx.runQuery(internal.investments.internalListInvestments, {});
        const active = (allInvestments || []).filter(
          (inv) =>
            (inv.investedAmount > 0 || (inv.units && inv.units > 0) || inv.currentValue > 0) &&
            inv.assetType !== "fd_rd" &&
            inv.assetType !== "ppf_epf" &&
            inv.assetType !== "real_estate" &&
            inv.assetType !== "other"
        );

        for (const inv of active.slice(0, 6)) {
          if (inv.assetType === "stock" || inv.assetType === "gold") {
            const cached: any = await ctx.runQuery(internal.investments.internalGetCachedStockPrice, {
              symbol: inv.ticker,
              isin: inv.isin,
              searchKey: normalizeStockSearchKey(inv.name),
            });
            if (cached?.price) {
              const live = await fetchStockQuote(inv.name, inv.notes, inv.isin, inv.ticker);
              if (live && live.price > 0) {
                const diff = Math.abs(live.price - cached.price);
                if (diff > 0.05) {
                  pricesMoved = true;
                  break;
                }
              }
            }
          }
        }
      } catch {}
    }

    if (!pricesMoved) {
      // All values match! Mark as verified settled so 3:30 PM run is stopped/skipped
      await ctx.runMutation(internal.investments.internalUpsertStockPriceCache, {
        symbol: "__MARKET_CLOSE_STATUS__",
        name: "SETTLED_MATCHED",
        price: 1, // 1 = settled & verified, stop 3rd run
        searchKey: `__market_close_${marketStatus.istDateStr}__`,
      });
      console.log("[MarketClose 3:25 PM] Cache DB values match live API quotes! 3:30 PM call will be stopped.");
      return { matched: true, skippedThirdCall: true };
    }

    // Prices shifted during closing auction: update cache DB now and let 3:30 PM finalize
    console.log("[MarketClose 3:25 PM] Price movement detected between 3:15 and 3:25 PM. Updating cache DB; 3:30 PM will finalize.");
    await ctx.runAction(api.investments.getMarketIndices, { force: true });
    const res = await ctx.runAction(api.investments.syncLiveMarketPrices, { force: true });

    await ctx.runMutation(internal.investments.internalUpsertStockPriceCache, {
      symbol: "__MARKET_CLOSE_STATUS__",
      name: "UPDATED_325_NEEDS_FINAL",
      price: 0, // 0 = not yet settled, 3:30 PM must run
      searchKey: `__market_close_${marketStatus.istDateStr}__`,
    });

    return { matched: false, updatedCount: res.count || 0 };
  },
});

/**
 * 3:30 PM IST Market Close Job (15:30 IST = 10:00 UTC, Mon-Fri):
 * Stage 3: Checks if 3:25 PM run already verified matching prices.
 * If already verified, stops and skips to prevent wasted API calls.
 * If prices shifted, runs final closing sync and permanently freezes prices.
 */
export const internalSyncMarketClose330Job = internalAction({
  args: {},
  handler: async (ctx) => {
    const marketStatus = getIndianMarketStatus();
    if (marketStatus.isWeekend || marketStatus.isHoliday) {
      console.log(`[MarketClose 3:30 PM] Market closed today (${marketStatus.reason}). Skipping.`);
      return { skipped: true, reason: marketStatus.reason };
    }

    // Check if 3:25 PM verified that cache DB matched live API
    const status: any = await ctx.runQuery(internal.investments.internalGetCachedStockPrice, {
      symbol: "__MARKET_CLOSE_STATUS__",
      searchKey: `__market_close_${marketStatus.istDateStr}__`,
    });

    if (status && status.price === 1) {
      console.log("[MarketClose 3:30 PM] Stopped: Cache DB was already verified and matched at 3:25 PM. Skipping 3rd cron call.");
      return { skipped: true, reason: "Cache already verified and matching from 3:25 PM run" };
    }

    console.log("[MarketClose 3:30 PM] Prices differed at 3:25 PM. Running final 3:30 PM closing sync...");
    await ctx.runAction(api.investments.getMarketIndices, { force: true });
    const res = await ctx.runAction(api.investments.syncLiveMarketPrices, { force: true });

    await ctx.runMutation(internal.investments.internalUpsertStockPriceCache, {
      symbol: "__MARKET_CLOSE_STATUS__",
      name: "FINALIZED_330",
      price: 1,
      searchKey: `__market_close_${marketStatus.istDateStr}__`,
    });

    console.log(`[MarketClose 3:30 PM] Successfully frozen closing prices for ${res.count || 0} holdings.`);
    return { success: true, count: res.count || 0 };
  },
});

// Backward compatibility alias for any existing trigger
export const internalSyncPostMarketCloseJob = internalSyncMarketClose330Job;

/**
 * 12:00 PM IST Mid-Day Mutual Fund NAV Release Sync (12:00 IST = 06:30 UTC, Mon-Fri):
 * Stage 1: Fetches latest published NAVs from official AMFI for all invested mutual fund schemes across all users.
 * Checks whether there is any change compared to the current DB NAV values:
 * - If NO CHANGE detected (and all funds successfully verified against AMFI): Marks midday status as SETTLED_NO_CHANGE (price = 1).
 *   This terminates the other two crons (12:15 and 12:30 PM) so cloud execution skips straight to the nightly sync!
 * - If CHANGES detected: Updates mfNavCache and propagates to holdings, then sets status to PENDING (price = 0)
 *   so the 12:15 PM job will run to re-verify if any further values shifted.
 * - If AMFI API is unreachable or partially timed out: Does NOT terminate early; leaves status as price = 0
 *   so 12:15 PM will automatically act as a failover retry.
 */
export const internalSyncMfMidday1200Job = internalAction({
  args: {},
  handler: async (ctx) => {
    const marketStatus = getIndianMarketStatus();
    if (marketStatus.isWeekend || marketStatus.isHoliday) {
      console.log(`[Midday MF 12:00 PM] Market closed today (${marketStatus.reason}). Skipping.`);
      return { skipped: true, reason: marketStatus.reason };
    }

    console.log("[Midday MF 12:00 PM] Stage 1: Fetching AMFI NAVs and checking for changes against DB...");

    const investedSchemes: any[] = await ctx.runQuery(internal.investments.internalListAllInvestedMfSchemes, {});
    if (!investedSchemes || investedSchemes.length === 0) {
      console.log("[Midday MF 12:00 PM] No invested mutual fund schemes found. Skipping.");
      return { verified: 0 };
    }

    const expectedDate = getLatestExpectedMfNavDate();
    let hasChanges = false;
    const fetchedUpdates: Array<{
      scheme: any;
      amfi: { nav: number; date?: string; prevNav?: number; schemeName?: string; schemeCode?: number; isin?: string };
    }> = [];

    for (const scheme of investedSchemes) {
      try {
        const cached: any = await ctx.runQuery(internal.investments.internalGetCachedMfNav, {
          isin: scheme.isin,
          schemeCode: scheme.schemeCode,
          searchKey: scheme.searchKey,
        });

        const amfi = await fetchMfNav(scheme.name, scheme.notes, scheme.schemeCode, scheme.isin);
        if (amfi && amfi.nav > 0) {
          const diff = Math.abs(amfi.nav - (cached?.nav ?? 0));
          const dateChanged = amfi.date && cached?.navDate && amfi.date !== cached.navDate;
          if (!cached?.nav || diff > 0.0001 || dateChanged) {
            hasChanges = true;
          }
          fetchedUpdates.push({ scheme, amfi });
        }
      } catch (err) {
        console.warn(`[Midday MF 12:00 PM] Error checking ${scheme.name}:`, err);
      }
    }

    const allFundsVerified = fetchedUpdates.length > 0 && fetchedUpdates.length === investedSchemes.length;

    if (allFundsVerified && !hasChanges) {
      // Genuine match: all funds verified against AMFI and none changed.
      // Terminate the other 2 crons (12:15 and 12:30 PM) and go straight to night job!
      await ctx.runMutation(internal.investments.internalUpsertStockPriceCache, {
        symbol: "__MIDDAY_MF_STATUS__",
        name: "SETTLED_NO_CHANGE",
        price: 1, // 1 = settled/terminated, stops 12:15 and 12:30 jobs
        searchKey: `__midday_mf_${marketStatus.istDateStr}__`,
      });
      console.log("[Midday MF 12:00 PM] All funds verified: no NAV changes detected vs DB. Terminating 12:15 & 12:30 PM jobs; proceeding straight to night job.");
      return { matched: true, changed: false, terminatedOtherJobs: true };
    }

    if (hasChanges) {
      // Changes detected: update the DB and trigger/allow the 12:15 PM cron job
      console.log(`[Midday MF 12:00 PM] NAV changes detected in ${fetchedUpdates.length} schemes. Updating DB...`);
      for (const { scheme, amfi } of fetchedUpdates) {
        await ctx.runMutation(internal.investments.internalUpsertMfNavCache, {
          isin: amfi.isin || scheme.isin,
          schemeCode: amfi.schemeCode || scheme.schemeCode || 0,
          schemeName: amfi.schemeName || scheme.name,
          nav: amfi.nav,
          navDate: amfi.date || expectedDate,
          prevNav: amfi.prevNav,
          searchKey: scheme.searchKey,
        });
      }

      await ctx.runMutation(internal.investments.internalSyncHoldingsFromMfCache, {});

      try {
        await ctx.runAction(api.investments.syncLiveMarketPrices, { force: true });
      } catch (err) {
        console.warn("[Midday MF 12:00 PM] Error in syncLiveMarketPrices:", err);
      }

      await ctx.runMutation(internal.investments.internalUpsertStockPriceCache, {
        symbol: "__MIDDAY_MF_STATUS__",
        name: "UPDATED_1200_PENDING_1215",
        price: 0, // 0 = not yet settled, 12:15 PM will run
        searchKey: `__midday_mf_${marketStatus.istDateStr}__`,
      });

      console.log(`[Midday MF 12:00 PM] DB successfully updated with new NAV values. 12:15 PM cron will verify.`);
      return { matched: false, changed: true, updatedCount: fetchedUpdates.length };
    }

    // Fallback: If external AMFI network failed or partial funds timed out, do NOT terminate.
    // Leave status as price = 0 so 12:15 PM acts as automatic self-healing retry.
    console.log(`[Midday MF 12:00 PM] AMFI API returned partial or no data (${fetchedUpdates.length}/${investedSchemes.length} funds). Retrying at 12:15 PM.`);
    await ctx.runMutation(internal.investments.internalUpsertStockPriceCache, {
      symbol: "__MIDDAY_MF_STATUS__",
      name: "RETRY_NEEDED_1215",
      price: 0,
      searchKey: `__midday_mf_${marketStatus.istDateStr}__`,
    });
    return { matched: false, retryScheduled: true, fetchedCount: fetchedUpdates.length };
  },
});

/**
 * 12:15 PM IST Mid-Day Mutual Fund NAV Verification (12:15 IST = 06:45 UTC, Mon-Fri):
 * Stage 2: Checks if 12:00 PM job already terminated early. If so, skips immediately.
 * Otherwise, calls AMFI API and compares fetched values with current DB values:
 * - If fetched value and DB value are SAME (all funds verified): Marks status as SETTLED_MATCHED_1215 (price = 1).
 *   This terminates the last cron (12:30 PM) and moves straight to the night job!
 * - If values still differ (more NAVs published): Updates DB and leaves status as price = 0
 *   so 12:30 PM cron will run the final sync.
 * - If AMFI timed out or failed: Does not terminate; leaves price = 0 so 12:30 PM retries.
 */
export const internalSyncMfMidday1215Job = internalAction({
  args: {},
  handler: async (ctx) => {
    const marketStatus = getIndianMarketStatus();
    if (marketStatus.isWeekend || marketStatus.isHoliday) {
      console.log(`[Midday MF 12:15 PM] Market closed today (${marketStatus.reason}). Skipping.`);
      return { skipped: true, reason: marketStatus.reason };
    }

    // Check if 12:00 PM detected no change and already terminated the remaining jobs
    const status: any = await ctx.runQuery(internal.investments.internalGetCachedStockPrice, {
      symbol: "__MIDDAY_MF_STATUS__",
      searchKey: `__midday_mf_${marketStatus.istDateStr}__`,
    });

    if (status && status.price === 1) {
      console.log(`[Midday MF 12:15 PM] Stopped: Midday MF NAV already terminated/settled (${status.name}). Skipping 12:15 PM cron.`);
      return { skipped: true, reason: `Already settled: ${status.name}` };
    }

    console.log("[Midday MF 12:15 PM] Stage 2: Calling AMFI API and comparing with DB NAV values...");

    const investedSchemes: any[] = await ctx.runQuery(internal.investments.internalListAllInvestedMfSchemes, {});
    if (!investedSchemes || investedSchemes.length === 0) return { verified: 0 };

    const expectedDate = getLatestExpectedMfNavDate();
    let pricesMoved = false;
    const fetchedUpdates: Array<{
      scheme: any;
      amfi: { nav: number; date?: string; prevNav?: number; schemeName?: string; schemeCode?: number; isin?: string };
    }> = [];

    for (const scheme of investedSchemes) {
      try {
        const cached: any = await ctx.runQuery(internal.investments.internalGetCachedMfNav, {
          isin: scheme.isin,
          schemeCode: scheme.schemeCode,
          searchKey: scheme.searchKey,
        });

        const amfi = await fetchMfNav(scheme.name, scheme.notes, scheme.schemeCode, scheme.isin);
        if (amfi && amfi.nav > 0) {
          const diff = Math.abs(amfi.nav - (cached?.nav ?? 0));
          const dateChanged = amfi.date && cached?.navDate && amfi.date !== cached.navDate;
          if (!cached?.nav || diff > 0.0001 || dateChanged) {
            pricesMoved = true;
          }
          fetchedUpdates.push({ scheme, amfi });
        }
      } catch (err) {
        console.warn(`[Midday MF 12:15 PM] Error checking ${scheme.name}:`, err);
      }
    }

    const allFundsVerified = fetchedUpdates.length > 0 && fetchedUpdates.length === investedSchemes.length;

    if (allFundsVerified && !pricesMoved) {
      // Fetched AMFI value and DB value are the same: terminate the last cron (12:30 PM) and move to night job!
      await ctx.runMutation(internal.investments.internalUpsertStockPriceCache, {
        symbol: "__MIDDAY_MF_STATUS__",
        name: "SETTLED_MATCHED_1215",
        price: 1, // 1 = settled & verified, terminate last cron (12:30 PM)
        searchKey: `__midday_mf_${marketStatus.istDateStr}__`,
      });
      console.log("[Midday MF 12:15 PM] Fetched AMFI NAVs match DB values! Terminating 12:30 PM cron; moving straight to night job.");
      return { matched: true, skippedThirdCall: true };
    }

    if (pricesMoved) {
      // Prices differed: update DB with newly published NAVs and let 12:30 PM finalize
      console.log(`[Midday MF 12:15 PM] Additional NAV updates detected between 12:00 and 12:15 PM. Updating DB...`);
      for (const { scheme, amfi } of fetchedUpdates) {
        await ctx.runMutation(internal.investments.internalUpsertMfNavCache, {
          isin: amfi.isin || scheme.isin,
          schemeCode: amfi.schemeCode || scheme.schemeCode || 0,
          schemeName: amfi.schemeName || scheme.name,
          nav: amfi.nav,
          navDate: amfi.date || expectedDate,
          prevNav: amfi.prevNav,
          searchKey: scheme.searchKey,
        });
      }

      await ctx.runMutation(internal.investments.internalSyncHoldingsFromMfCache, {});

      try {
        await ctx.runAction(api.investments.syncLiveMarketPrices, { force: true });
      } catch (err) {
        console.warn("[Midday MF 12:15 PM] Error in syncLiveMarketPrices:", err);
      }

      await ctx.runMutation(internal.investments.internalUpsertStockPriceCache, {
        symbol: "__MIDDAY_MF_STATUS__",
        name: "UPDATED_1215_NEEDS_FINAL_1230",
        price: 0,
        searchKey: `__midday_mf_${marketStatus.istDateStr}__`,
      });

      return { matched: false, updatedCount: fetchedUpdates.length };
    }

    // Partial/network issue: keep price = 0 so 12:30 PM retries
    console.log(`[Midday MF 12:15 PM] Partial or no responses from AMFI (${fetchedUpdates.length}/${investedSchemes.length}). 12:30 PM will retry.`);
    await ctx.runMutation(internal.investments.internalUpsertStockPriceCache, {
      symbol: "__MIDDAY_MF_STATUS__",
      name: "RETRY_NEEDED_1230",
      price: 0,
      searchKey: `__midday_mf_${marketStatus.istDateStr}__`,
    });
    return { matched: false, retryScheduled: true };
  },
});

/**
 * 12:30 PM IST Mid-Day Mutual Fund NAV Final Close Sync (12:30 IST = 07:00 UTC, Mon-Fri):
 * Stage 3: Checks if 12:00 PM or 12:15 PM already verified matching prices and marked settled.
 * If already settled, stops and skips to prevent wasted API calls and redundant processing.
 * If values shifted at 12:15 PM, runs final midday sync, updates DB, marks as FINALIZED_1230,
 * and moves straight to the nightly sync window.
 */
export const internalSyncMfMidday1230Job = internalAction({
  args: {},
  handler: async (ctx) => {
    const marketStatus = getIndianMarketStatus();
    if (marketStatus.isWeekend || marketStatus.isHoliday) {
      console.log(`[Midday MF 12:30 PM] Market closed today (${marketStatus.reason}). Skipping.`);
      return { skipped: true, reason: marketStatus.reason };
    }

    // Check if 12:00 PM or 12:15 PM already settled
    const status: any = await ctx.runQuery(internal.investments.internalGetCachedStockPrice, {
      symbol: "__MIDDAY_MF_STATUS__",
      searchKey: `__midday_mf_${marketStatus.istDateStr}__`,
    });

    if (status && status.price === 1) {
      console.log(`[Midday MF 12:30 PM] Stopped: Midday MF NAV already settled and verified (${status.name}). Skipping 3rd cron call.`);
      return { skipped: true, reason: `Already settled: ${status.name}` };
    }

    console.log("[Midday MF 12:30 PM] Running 12:30 PM midday sync...");

    const investedSchemes: any[] = await ctx.runQuery(internal.investments.internalListAllInvestedMfSchemes, {});
    if (!investedSchemes || investedSchemes.length === 0) return { verified: 0 };

    const expectedDate = getLatestExpectedMfNavDate();
    let updatedCount = 0;

    for (const scheme of investedSchemes) {
      try {
        const amfi = await fetchMfNav(scheme.name, scheme.notes, scheme.schemeCode, scheme.isin);
        if (amfi && amfi.nav > 0) {
          await ctx.runMutation(internal.investments.internalUpsertMfNavCache, {
            isin: amfi.isin || scheme.isin,
            schemeCode: amfi.schemeCode || scheme.schemeCode || 0,
            schemeName: amfi.schemeName || scheme.name,
            nav: amfi.nav,
            navDate: amfi.date || expectedDate,
            prevNav: amfi.prevNav,
            searchKey: scheme.searchKey,
          });
          updatedCount++;
        }
      } catch (err) {
        console.warn(`[Midday MF 12:30 PM] Error syncing ${scheme.name}:`, err);
      }
    }

    if (updatedCount > 0) {
      await ctx.runMutation(internal.investments.internalSyncHoldingsFromMfCache, {});

      try {
        await ctx.runAction(api.investments.syncLiveMarketPrices, { force: true });
      } catch (err) {
        console.warn("[Midday MF 12:30 PM] Error in syncLiveMarketPrices:", err);
      }
    }

    await ctx.runMutation(internal.investments.internalUpsertStockPriceCache, {
      symbol: "__MIDDAY_MF_STATUS__",
      name: "FINALIZED_1230",
      price: 1, // Finalized
      searchKey: `__midday_mf_${marketStatus.istDateStr}__`,
    });

    console.log(`[Midday MF 12:30 PM] Midday NAV processing completed (updated: ${updatedCount}). Moving straight to night job.`);
    return { success: true, count: updatedCount };
  },
});




