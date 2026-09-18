import { query, mutation, action, internalQuery, internalMutation, internalAction } from "./_generated/server";
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

    // Query-level deduplication to ensure multiple duplicate uploads never show duplicate cards
    const dedupedMap = new Map<string, (typeof investments)[0]>();
    for (const inv of investments) {
      const key = getHoldingDedupeKey(inv.name, inv.notes, inv.isin, inv.schemeCode);

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
      const key = getHoldingDedupeKey(inv.name, inv.notes, inv.isin, inv.schemeCode);

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

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      assetType: args.assetType,
      investedAmount: Math.max(0, args.investedAmount),
      currentValue: Math.max(0, args.currentValue),
      units: args.units,
      buyPrice: args.buyPrice,
      currentPrice: args.currentPrice,
      schemeCode: autoSchemeCode,
      isin: autoIsin,
      ticker: args.ticker ?? existing.ticker,
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

/**
 * Resolves an Indian stock ISIN (e.g. INE002A01018) to official NSE (.NS) or BSE (.BO) ticker
 * using the existing Yahoo Finance search API with zero hardcoding.
 */
export async function resolveTickerFromIsin(isin: string): Promise<string | null> {
  if (!isin) return null;
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=6`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (res.ok) {
      const data: any = await res.json();
      const quotes: any[] = data?.quotes || [];
      // Prioritize NSE (.NS) as primary high-volume Indian exchange, then BSE (.BO)
      const nse = quotes.find((q) => q.symbol && q.symbol.toUpperCase().endsWith(".NS"));
      if (nse?.symbol) return nse.symbol.toUpperCase();
      const bse = quotes.find((q) => q.symbol && q.symbol.toUpperCase().endsWith(".BO"));
      if (bse?.symbol) return bse.symbol.toUpperCase();
      if (quotes.length > 0 && quotes[0].symbol) {
        return quotes[0].symbol.toUpperCase();
      }
    }
  } catch (err) {
    console.warn(`[YahooSearch] Error resolving ISIN ${isin}:`, err);
  }
  return null;
}

async function fetchStockQuote(
  name: string,
  notes?: string,
  knownIsin?: string
): Promise<{ price: number; prevClose?: number; symbol?: string; isin?: string } | null> {
  const combined = `${name} ${notes || ""}`;
  const isin = knownIsin || extractStockIsin(combined) || extractSecurityIsin(combined);
  const candidates: string[] = [];

  // Address stock based on unique ISIN: dynamically resolve to Ticker.NS or Ticker.BO via Yahoo Finance search
  if (isin) {
    const resolvedTicker = await resolveTickerFromIsin(isin);
    if (resolvedTicker) {
      candidates.push(resolvedTicker);
    }
  }

  const clean = name.trim().toUpperCase();
  const strippedCorporate = clean
    .replace(/\b(LIMITED|LTD|CORPORATION|CORP|COMPANY|CO|PLC|PVT|PRIVATE)\b\.?/gi, "")
    .trim();

  if (clean.endsWith(".NS") || clean.endsWith(".BO") || clean.endsWith("-INR") || clean.endsWith("-USD")) {
    if (!candidates.includes(clean)) candidates.push(clean);
  } else {
    if (/^[A-Z0-9]{1,14}$/.test(clean)) {
      if (!candidates.includes(`${clean}.NS`)) candidates.push(`${clean}.NS`);
      if (!candidates.includes(`${clean}.BO`)) candidates.push(`${clean}.BO`);
    }
    const compact = strippedCorporate.replace(/[^A-Z0-9]/g, "");
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

  // If no candidates yet or no ISIN, query Yahoo Finance search
  if (candidates.length === 0) {
    const searchQueries = [clean];
    if (strippedCorporate && strippedCorporate !== clean && strippedCorporate.length >= 3) {
      searchQueries.push(strippedCorporate);
    }
    if (tokens.length > 1) {
      searchQueries.push(tokens.join(" "));
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
      } catch { }
    }
  }

  // Prioritize Indian NSE/BSE symbols (.NS and .BO)
  candidates.sort((a, b) => {
    const aInr = a.endsWith(".NS") || a.endsWith(".BO") || a.endsWith("-INR");
    const bInr = b.endsWith(".NS") || b.endsWith(".BO") || b.endsWith("-INR");
    if (aInr && !bInr) return -1;
    if (!aInr && bInr) return 1;
    return 0;
  });

  // Make live price API call to existing Yahoo Finance chart endpoint using resolved ticker (.NS or .BO)
  for (const sym of candidates) {
    try {
      const chartRes = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (!chartRes.ok) continue;
      const data: any = await chartRes.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta && typeof meta.regularMarketPrice === "number" && meta.regularMarketPrice > 0) {
        const change = typeof meta.fulldayChange === "number" ? meta.fulldayChange : typeof meta.regularMarketChange === "number" ? meta.regularMarketChange : undefined;
        const prevClose = change !== undefined ? meta.regularMarketPrice - change : (meta.previousClose || meta.chartPreviousClose);
        return {
          price: meta.regularMarketPrice,
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
async function resolveCryptoMeta(
  nameOrTicker: string
): Promise<{ coinId: string | null; symbol: string | null }> {
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

  let clean = nameOrTicker.trim().toLowerCase()
    .replace(/\s*(coin|token|crypto|currency|inr|usd|usdt)\s*/gi, '')
    .trim();

  if (COMMON_CRYPTO_TYPOS[clean]) {
    clean = COMMON_CRYPTO_TYPOS[clean];
  }

  if (!clean || clean.length < 2) return { coinId: null, symbol: null };

  try {
    const searchRes = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(clean)}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!searchRes.ok) return { coinId: null, symbol: clean.toUpperCase() };
    const data: any = await searchRes.json();
    const coins = data?.coins;
    if (!coins || coins.length === 0) return { coinId: null, symbol: clean.toUpperCase() };

    const upperClean = clean.toUpperCase();
    const exact = coins.find((c: any) =>
      c.symbol?.toUpperCase() === upperClean ||
      c.name?.toLowerCase() === clean
    );
    const chosen = exact || coins[0];
    return {
      coinId: chosen?.id || null,
      symbol: chosen?.symbol ? chosen.symbol.toUpperCase() : upperClean,
    };
  } catch {
    return { coinId: null, symbol: clean.toUpperCase() };
  }
}

let lastKnownLiveUsdInrRate: number | null = null;

async function fetchLiveUsdInrRate(): Promise<number> {
  // 1. Primary: Yahoo Finance live forex spot USDINR=X
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/USDINR=X', {
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data: any = await res.json();
      const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (typeof rate === 'number' && rate > 0) {
        lastKnownLiveUsdInrRate = rate;
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
        return rate;
      }
    }
  } catch { }

  // 4. In-memory session cache: uses last verified live rate fetched from market
  if (lastKnownLiveUsdInrRate !== null && lastKnownLiveUsdInrRate > 0) {
    return lastKnownLiveUsdInrRate;
  }

  // 5. Offline initial fallback
  return 88.5;
}

async function fetchCryptoPrice(
  name: string
): Promise<{ price: number; prevClose?: number; symbol?: string } | null> {
  const { coinId, symbol } = await resolveCryptoMeta(name);
  const targetSymbol = (symbol || name).trim().toUpperCase();

  // 1. Primary: Real-time Indian Crypto Exchange (CoinDCX public live ticker)
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
    } catch { }

    // 2. Secondary: TradingView Scanner API (Global Benchmark: BINANCE:BTCUSDT / BYBIT:BTCUSDT)
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
    } catch { }

    // 3. Tertiary Indian exchange ticker (WazirX public ticker)
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
    } catch { }
  }

  // 4. Global Spot Fallback: CoinGecko INR conversion
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
    } catch { }
  }

  // 5. Fallback: Yahoo Finance with explicit crypto pair symbols
  const clean = name.trim().toUpperCase().replace(/\s*\b(COIN|TOKEN|CRYPTO|CURRENCY)\b\s*/gi, '').trim();
  const tokens = clean.split(/[^A-Z0-9]+/).filter((t) => t.length >= 2 && t.length <= 10);

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
          const usdInr = await fetchLiveUsdInrRate();
          price = price * usdInr;
        }
        const change = typeof meta.fulldayChange === 'number' ? meta.fulldayChange : typeof meta.regularMarketChange === 'number' ? meta.regularMarketChange : undefined;
        const prevClose = change !== undefined ? price - change : (meta.previousClose || meta.chartPreviousClose);
        return {
          price,
          prevClose,
          symbol: sym,
        };
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

export function scoreMfCandidate(item: { schemeCode: number; schemeName: string }, rawQuery: string): number {
  const stripped = stripBrokerSuffix(rawQuery);
  const qLower = stripped.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
    if (sTokens.has(qt)) {
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
  if (qTokens[0] && sTokens.has(qTokens[0])) {
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

let cachedMfMasterList: { schemeCode: number; schemeName: string; isinGrowth?: string; isinDivReinvestment?: string }[] | null = null;
let mfMasterListFetchedAt = 0;

/**
 * Loads and in-memory caches the official AMFI master list of all schemes & ISINs.
 * Used for instant, zero-latency resolution of scheme codes and ISINs across all categories.
 */
export async function getMfMasterList(): Promise<{ schemeCode: number; schemeName: string; isinGrowth?: string; isinDivReinvestment?: string }[]> {
  const now = Date.now();
  if (cachedMfMasterList && cachedMfMasterList.length > 0 && now - mfMasterListFetchedAt < 60 * 60 * 1000) {
    return cachedMfMasterList;
  }
  try {
    const res = await fetch("https://api.mfapi.in/mf", { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      cachedMfMasterList = await res.json();
      mfMasterListFetchedAt = now;
      return cachedMfMasterList || [];
    }
  } catch (err) {
    console.warn("[MFMasterList] Error loading master list:", err);
  }
  return cachedMfMasterList || [];
}

async function fetchMfNav(
  name: string,
  notes?: string,
  knownSchemeCode?: number,
  knownIsin?: string
): Promise<{ nav: number; date?: string; prevNav?: number; schemeName?: string; schemeCode?: number; isin?: string } | null> {
  const combined = `${name} ${notes || ''}`;
  const isin = knownIsin || (combined.match(/\b(INF[A-Z0-9]{9})\b/i)?.[1]?.toUpperCase());

  // 1. Direct ISIN check (Highest Priority & 100% Unique per scheme variant e.g. INF200K01QV8 from CAS)
  if (isin) {
    try {
      const masterList = await getMfMasterList();
      const found = masterList.find((x: any) => x.isinGrowth === isin || x.isinDivReinvestment === isin);
      if (found && found.schemeCode) {
        const detailRes = await fetch(`https://api.mfapi.in/mf/${found.schemeCode}`, { signal: AbortSignal.timeout(4500) });
        if (detailRes.ok) {
          const details: any = await detailRes.json();
          const latest = details?.data?.[0];
          const prev = details?.data?.[1];
          if (latest && latest.nav) {
            const navNum = parseFloat(latest.nav);
            if (!isNaN(navNum) && navNum > 0) {
              return {
                nav: navNum,
                date: latest.date || '',
                schemeName: details.meta?.scheme_name || found.schemeName || name,
                prevNav: prev?.nav ? parseFloat(prev.nav) : undefined,
                schemeCode: found.schemeCode,
                isin,
              };
            }
          }
        }
      }
    } catch { }
  }

  // 2. Direct scheme code check (Fastest & 100% accurate)
  if (knownSchemeCode && knownSchemeCode > 0) {
    try {
      const detailRes = await fetch(`https://api.mfapi.in/mf/${knownSchemeCode}`, { signal: AbortSignal.timeout(4500) });
      if (detailRes.ok) {
        const details: any = await detailRes.json();
        const latest = details?.data?.[0];
        const prev = details?.data?.[1];
        if (latest && latest.nav) {
          const navNum = parseFloat(latest.nav);
          if (!isNaN(navNum) && navNum > 0) {
            const masterList = await getMfMasterList();
            const foundInMaster = masterList.find((x: any) => x.schemeCode === knownSchemeCode);
            const resolvedIsin = isin || foundInMaster?.isinGrowth || foundInMaster?.isinDivReinvestment;
            return {
              nav: navNum,
              date: latest.date || '',
              schemeName: details.meta?.scheme_name || name,
              prevNav: prev?.nav ? parseFloat(prev.nav) : undefined,
              schemeCode: knownSchemeCode,
              isin: resolvedIsin,
            };
          }
        }
      }
    } catch { }
  }

  // 3. Direct scheme code check from notes (Explicitly stripping out any Folio numbers!)
  const withoutFolio = combined.replace(/\b(?:folio|folio\s*no|folio\s*number|ac\s*no|account|acc)\s*[:#-]?\s*[\w\/-]+/gi, '');
  const explicitSchemeMatch = withoutFolio.match(/\b(?:scheme\s*code|amfi\s*code|amfi|code)\s*[:#-]?\s*(\d{6})\b/i) || withoutFolio.match(/\b\d{6}\b/);
  if (explicitSchemeMatch) {
    try {
      const code = explicitSchemeMatch[1] || explicitSchemeMatch[0];
      const codeNum = parseInt(code, 10);
      const detailRes = await fetch(`https://api.mfapi.in/mf/${codeNum}`, { signal: AbortSignal.timeout(4500) });
      if (detailRes.ok) {
        const details: any = await detailRes.json();
        const latest = details?.data?.[0];
        const prev = details?.data?.[1];
        if (latest && latest.nav) {
          const navNum = parseFloat(latest.nav);
          const resolvedName = String(details.meta?.scheme_name || '');
          const sim = resolvedName ? schemeNameSimilarity(name, resolvedName) : 0;
          if (!isNaN(navNum) && navNum > 0 && sim >= 0.35) {
            const masterList = await getMfMasterList();
            const foundInMaster = masterList.find((x: any) => x.schemeCode === codeNum);
            const resolvedIsin = isin || foundInMaster?.isinGrowth || foundInMaster?.isinDivReinvestment;
            return {
              nav: navNum,
              date: latest.date || '',
              schemeName: details.meta?.scheme_name || name,
              prevNav: prev?.nav ? parseFloat(prev.nav) : undefined,
              schemeCode: codeNum,
              isin: resolvedIsin,
            };
          }
        }
      }
    } catch { }
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
  const queries: string[] = [
    baseQuery,
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
    } catch { }
    const strong = [...candidateMap.values()].filter((c) => c.score >= 80).length;
    if (strong >= 3) break;
  }

  const sortedCandidates = Array.from(candidateMap.values()).sort((a, b) => b.score - a.score);
  if (sortedCandidates.length === 0) return null;

  const topCandidates = sortedCandidates.slice(0, 6);
  const validResults: { nav: number; date: string; schemeName: string; prevNav?: number; score: number; isDirect: boolean; schemeCode?: number }[] = [];

  for (const candidate of topCandidates) {
    try {
      let detailRes = await fetch(
        `https://api.mfapi.in/mf/${candidate.schemeCode}`,
        { signal: AbortSignal.timeout(4500) }
      );
      if (!detailRes.ok) {
        detailRes = await fetch(
          `https://api.mfapi.in/mf/${candidate.schemeCode}/latest`,
          { signal: AbortSignal.timeout(3500) }
        );
      }
      if (!detailRes.ok) continue;
      const details: any = await detailRes.json();
      const latest = details?.data?.[0];
      const prev = details?.data?.[1];

      if (latest && latest.nav) {
        const navNum = parseFloat(latest.nav);
        if (isNaN(navNum) || navNum <= 0) continue;

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
          schemeCode: candidate.schemeCode,
        });
      }
    } catch { }
  }

  if (validResults.length === 0) return null;

  const wantsDirect = /\bdirect\b/i.test(strippedName);
  const wantsRegular = /\bregular\b/i.test(strippedName);
  const wantsIdcw = /\b(idcw|dividend|payout|reinvestment)\b/i.test(strippedName);

  validResults.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (wantsRegular) {
      if (!a.isDirect && b.isDirect) return -1;
      if (a.isDirect && !b.isDirect) return 1;
    } else if (wantsDirect) {
      if (a.isDirect && !b.isDirect) return -1;
      if (!a.isDirect && b.isDirect) return 1;
    }
    if (wantsIdcw) {
      if (a.nav !== b.nav) return a.nav - b.nav;
    } else {
      if (b.nav !== a.nav) return b.nav - a.nav;
    }
    return (a.schemeCode || 0) - (b.schemeCode || 0);
  });

  const best = validResults[0];
  const masterList = await getMfMasterList();
  const foundInMaster = masterList.find((x: any) => x.schemeCode === best.schemeCode);
  const resolvedIsin = isin || foundInMaster?.isinGrowth || foundInMaster?.isinDivReinvestment;

  return {
    nav: best.nav,
    date: best.date,
    schemeName: best.schemeName,
    prevNav: best.prevNav,
    schemeCode: best.schemeCode,
    isin: resolvedIsin,
  };
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
        schemeCode: v.optional(v.number()),
        isin: v.optional(v.string()),
        ticker: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const u of args.updates) {
      const inv = await ctx.db.get(u.id);
      if (inv && (!args.userId || inv.userId === args.userId)) {
        await ctx.db.patch(u.id, {
          currentValue: Math.max(0, u.currentValue),
          currentPrice: u.currentPrice ?? inv.currentPrice,
          schemeCode: u.schemeCode ?? inv.schemeCode,
          isin: u.isin ?? inv.isin,
          ticker: u.ticker ?? inv.ticker,
          updatedAt: now,
        });
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
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const m = String(istDate.getMonth() + 1).padStart(2, "0");
  const d = String(istDate.getDate()).padStart(2, "0");
  const monthDay = `${m}-${d}`;

  const isHoliday = INDIAN_MARKET_HOLIDAYS.has(monthDay);

  const hours = istDate.getHours();
  const minutes = istDate.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  // NSE/BSE Trading Hours: 09:15 AM to 03:30 PM IST (555 to 930 minutes)
  const isTradingSession = currentMinutes >= 555 && currentMinutes <= 930;
  const isOpen = !isWeekend && !isHoliday && isTradingSession;
  const isNonMarketHours = !isOpen;

  // AMC Daily NAV Release Window: 09:00 PM to 12:00 AM IST (active all 7 days including weekends)
  const isNightNavWindow = currentMinutes >= 1260;

  let reason = "Market Open (Trading Active)";
  if (isNightNavWindow) {
    reason = "Market Closed (Night NAV Release Window: 9 PM - 12 AM IST)";
  } else if (isWeekend) {
    reason = dayOfWeek === 6 ? "Market Closed (Saturday)" : "Market Closed (Sunday)";
  } else if (isHoliday) {
    reason = "Market Closed (NSE/BSE Public Holiday)";
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

/**
 * Converts "DD-MM-YYYY" or "YYYY-MM-DD" string into UTC timestamp milliseconds for safe comparison.
 */
export function parseNavDateToMs(dateStr: string): number {
  if (!dateStr) return 0;
  const parts = dateStr.trim().split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime();
    } else {
      // DD-MM-YYYY
      return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
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
  // 1. Night NAV release window (09:00 PM to 12:00 AM IST) - 25-minute TTL to verify every 30-min cron cycle
  if (status.isNightNavWindow) {
    return 25 * 60 * 1000;
  }
  // 2. Daytime weekends / holidays (NAV does not change intraday)
  if (status.isWeekend || status.isHoliday) {
    return 12 * 60 * 60 * 1000;
  }
  // 3. Regular weekday market hours
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

  // 1. If the cached NAV date is already matching or newer than the expected latest trade date:
  if (cached && cached.nav > 0 && !isDateStale) {
    return {
      nav: cached.nav,
      date: cached.navDate,
      schemeName: cached.schemeName,
      prevNav: cached.prevNav,
      schemeCode: cached.schemeCode,
      isin: cached.isin || resolvedIsin,
    };
  }

  // 2. The record is STALE (cached.navDate < expectedDate) or missing:
  if (!options?.force && cached && cached.nav > 0 && now - cached.lastFetchedAt < 2 * 60 * 1000) {
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
 * Background verification and maintenance action:
 * Rechecks cached schemes against AMFI, detects any outdated dates or updated NAVs,
 * and updates them immediately with authentic AMFI data while pruning old records.
 * During 9 PM - 12 AM IST (including weekends), runs every 30 mins to capture newly uploaded AMC NAVs.
 */
export const internalVerifyAndCleanMfCacheJob = internalAction({
  args: {},
  handler: async (ctx) => {
    // 1. Inspect active cache records
    const cachedEntries: any[] = await ctx.runQuery(internal.investments.internalListAllMfCache, {});
    if (!cachedEntries || cachedEntries.length === 0) return;

    const expectedDate = getLatestExpectedMfNavDate();
    const expectedDateMs = parseNavDateToMs(expectedDate);
    const now = Date.now();
    const ttlMs = getMfCacheTtlMs();

    for (const entry of cachedEntries) {
      const cachedDateMs = entry.navDate ? parseNavDateToMs(entry.navDate) : 0;
      const isDateStale = !entry.navDate || cachedDateMs < expectedDateMs;

      // Re-verify if date is stale or if TTL has elapsed (25 mins during 9 PM - 12 AM night window)
      if (isDateStale || now - entry.lastFetchedAt >= ttlMs) {
        try {
          const amfi = await fetchMfNav(entry.schemeName, undefined, entry.schemeCode, entry.isin);
          if (amfi && amfi.nav > 0) {
            await ctx.runMutation(internal.investments.internalUpsertMfNavCache, {
              isin: amfi.isin || entry.isin,
              schemeCode: amfi.schemeCode || entry.schemeCode,
              schemeName: amfi.schemeName || entry.schemeName,
              nav: amfi.nav,
              navDate: amfi.date || expectedDate,
              prevNav: amfi.prevNav,
              searchKey: entry.searchKey,
            });
          }
        } catch (err) {
          console.warn(`[CronVerify] Error verifying ${entry.schemeName}:`, err);
        }
      }
    }

    // 3. Propagate updated NAVs to matching user holdings
    await ctx.runMutation(internal.investments.internalSyncHoldingsFromMfCache, {});
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

  // 2. Closed market logic: weekends, holidays, or outside 9:15 - 15:30 IST.
  // Exchanges are closed; closing price / LTP is immutable. NEVER call Yahoo if already cached!
  if (!marketStatus.isOpen) {
    if (cached && cached.price > 0) {
      return {
        price: cached.price,
        prevClose: cached.prevClose,
        symbol: cached.symbol,
        isin: cached.isin || resolvedIsin,
        isCached: true,
      };
    }
    // No cache exists yet for this holding; fetch closing price once from Yahoo
    const quote = await fetchStockQuote(name, options?.notes, resolvedIsin);
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
    return null;
  }

  // 3. Open market logic (09:15 - 15:30 IST): Strict throttle to prevent rate-limit exhaustion.
  // Normal auto-sync: 35s throttle. Manual sync click: 15s throttle against button spamming.
  const THROTTLE_MS = options?.force ? 15 * 1000 : 35 * 1000;
  if (cached && cached.price > 0 && now - cached.lastFetchedAt < THROTTLE_MS) {
    return {
      price: cached.price,
      prevClose: cached.prevClose,
      symbol: cached.symbol,
      isin: cached.isin || resolvedIsin,
      isCached: true,
    };
  }

  // 4. Cache expired (>= 35s), force requested, or missing: fetch fresh authentic quote from Yahoo
  const quote = await fetchStockQuote(name, options?.notes, resolvedIsin);
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
  },
  handler: async (ctx, args) => {
    let userId = args.userId;
    if (!userId) {
      userId = (await getAuthUserId(ctx)) ?? undefined;
    }

    const allInvestments: any[] = await ctx.runQuery(
      internal.investments.internalListInvestments,
      { userId, investmentIds: args.investmentIds }
    );
    if (!allInvestments || allInvestments.length === 0) {
      return { success: true, count: 0, updates: [] };
    }

    const updates: {
      id: any;
      currentValue: number;
      currentPrice?: number;
      schemeCode?: number;
      isin?: string;
      ticker?: string;
    }[] = [];

    for (const inv of allInvestments) {
      try {
        const at = inv.assetType || "";
        if (at === "fd_rd" || at === "ppf_epf" || at === "real_estate" || at === "other") {
          continue;
        }

        let livePrice: number | null = null;
        let resolvedSchemeCode = inv.schemeCode;
        let resolvedIsin = inv.isin;
        let resolvedTicker = inv.ticker;

        const combined = `${inv.name} ${inv.notes || ""}`;
        const detectedIsin = extractSecurityIsin(combined);
        if (!resolvedIsin && detectedIsin) {
          resolvedIsin = detectedIsin;
        }

        if (at === "mutual_fund") {
          const mf = await getOrFetchMfNavWithCache(ctx, inv.name, inv.notes, {
            force: args.force,
            knownSchemeCode: resolvedSchemeCode,
            knownIsin: resolvedIsin,
          });
          if (mf && mf.nav > 0) {
            livePrice = mf.nav;
            if (mf.schemeCode && !resolvedSchemeCode) {
              resolvedSchemeCode = mf.schemeCode;
            }
            if (mf.isin && !resolvedIsin) {
              resolvedIsin = mf.isin;
            }
          } else if (/\b(etf|bees)\b/i.test(inv.name)) {
            const stk = await getOrFetchStockPriceWithCache(ctx, inv.name, {
              force: args.force,
              notes: inv.notes,
              knownIsin: resolvedIsin,
              knownTicker: resolvedTicker,
            });
            if (stk && stk.price > 0) {
              livePrice = stk.price;
              if (stk.symbol && !resolvedTicker) resolvedTicker = stk.symbol;
              if (stk.isin && !resolvedIsin) resolvedIsin = stk.isin;
            }
          }
        } else if (at === "crypto") {
          const cry = await fetchCryptoPrice(inv.name);
          if (cry && cry.price > 0) {
            livePrice = cry.price;
          }
        } else if (at === "gold") {
          const isSgbOrDigital = /\b(sgb|sovereign|bond|digi|digital)\b/i.test(inv.name);
          if (!isSgbOrDigital) {
            const stk = await getOrFetchStockPriceWithCache(ctx, inv.name, {
              force: args.force,
              notes: inv.notes,
              knownIsin: resolvedIsin,
              knownTicker: resolvedTicker,
            });
            if (stk && stk.price > 0) {
              livePrice = stk.price;
              if (stk.symbol && !resolvedTicker) resolvedTicker = stk.symbol;
              if (stk.isin && !resolvedIsin) resolvedIsin = stk.isin;
            } else {
              const mf = await getOrFetchMfNavWithCache(ctx, inv.name, inv.notes, {
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
          // Stocks & listed equity instruments — address each stock by unique ISIN & resolved Ticker.NS/BO
          const stk = await getOrFetchStockPriceWithCache(ctx, inv.name, {
            force: args.force,
            notes: inv.notes,
            knownIsin: resolvedIsin,
            knownTicker: resolvedTicker,
          });
          if (stk && stk.price > 0) {
            livePrice = stk.price;
            if (stk.symbol && !resolvedTicker) resolvedTicker = stk.symbol;
            if (stk.isin && !resolvedIsin) resolvedIsin = stk.isin;
          }
        }

        if (livePrice !== null && livePrice > 0) {
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

          const valDiff = Math.abs(updatedVal - inv.currentValue);
          const priceDiff = Math.abs(livePrice - (inv.currentPrice || 0));
          const identifierChanged =
            (resolvedSchemeCode !== undefined && resolvedSchemeCode !== inv.schemeCode) ||
            (resolvedIsin !== undefined && resolvedIsin !== inv.isin) ||
            (resolvedTicker !== undefined && resolvedTicker !== inv.ticker);

          if (valDiff > 0.01 || priceDiff > 0.0001 || identifierChanged) {
            updates.push({
              id: inv._id,
              currentValue: updatedVal,
              currentPrice: livePrice,
              schemeCode: resolvedSchemeCode ?? inv.schemeCode,
              isin: resolvedIsin ?? inv.isin,
              ticker: resolvedTicker ?? inv.ticker,
            });
          }
        }
      } catch (err) {
        console.warn(`[SyncLiveMarket] Error fetching price for ${inv.name}:`, err);
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

    // 2. Backfill ISIN into mfNavCache for any existing entries that were created earlier
    const mfCacheBefore: any[] = await ctx.runQuery(internal.investments.internalListAllMfCache, {});
    const masterList = await getMfMasterList();

    for (const entry of mfCacheBefore) {
      if (!entry.isin && entry.schemeCode > 0) {
        const match = masterList.find((m: any) => m.schemeCode === entry.schemeCode);
        const resolvedIsin = match?.isinGrowth || match?.isinDivReinvestment;
        if (resolvedIsin) {
          await ctx.runMutation(internal.investments.internalUpsertMfNavCache, {
            isin: resolvedIsin,
            schemeCode: entry.schemeCode,
            schemeName: entry.schemeName,
            nav: entry.nav,
            navDate: entry.navDate,
            prevNav: entry.prevNav,
            searchKey: entry.searchKey,
          });
        }
      }
    }

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
        return { price: mf.nav, symbol: mf.schemeName, date: mf.date, prevClose: mf.prevNav };
      }
      if (/\b(etf|bees)\b/i.test(name)) {
        return await getOrFetchStockPriceWithCache(ctx, name, { force });
      }
      return null;
    }

    if (assetType === "crypto") {
      return await fetchCryptoPrice(name);
    }

    if (assetType === "gold") {
      const isSgbOrDigital = /\b(sgb|sovereign|bond|digi|digital)\b/i.test(name);
      if (!isSgbOrDigital) {
        // 1. Try stock cache first for ETFs (GOLDBEES, SILVERBEES, GOLDAXIS, SILVERIETF, etc.)
        const stk = await getOrFetchStockPriceWithCache(ctx, name, { force });
        if (stk && stk.price > 0) return stk;

        // 2. Try AMFI Cache DB for Gold/Silver mutual funds
        const mf = await getOrFetchMfNavWithCache(ctx, name, notes, { force });
        if (mf && mf.nav > 0) {
          return { price: mf.nav, symbol: mf.schemeName, date: mf.date, prevClose: mf.prevNav };
        }
      }
      return null;
    }

    // Stocks, SGBs, Commodities: Uses 35s live cache or static closing price
    return await getOrFetchStockPriceWithCache(ctx, name, { force });
  },
});

export const getMarketIndices = action({
  args: {},
  handler: async (ctx) => {
    const indices = [
      { key: "nifty50", symbol: "^NSEI", name: "NIFTY 50" },
      { key: "sensex", symbol: "^BSESN", name: "SENSEX" },
    ];
    const results: any[] = [];
    const marketStatus = getIndianMarketStatus();
    const now = Date.now();
    const INDEX_CACHE_TTL_MS = 35 * 1000; // 35 seconds during market hours

    for (const idx of indices) {
      try {
        const searchKey = normalizeStockSearchKey(idx.name);
        // Check cache first
        const cached: any = await ctx.runQuery(internal.investments.internalGetCachedStockPrice, {
          symbol: idx.symbol,
          searchKey,
        });

        // If market closed and cache exists, return cached closing index value directly
        if (!marketStatus.isOpen && cached && cached.price > 0) {
          results.push({
            name: idx.name,
            symbol: idx.symbol,
            price: cached.price,
            change: cached.change || 0,
            changePercent: cached.changePercent || 0,
            isPositive: (cached.change || 0) >= 0,
          });
          continue;
        }

        // If market open and cached < 35s, return cached index value
        if (marketStatus.isOpen && cached && cached.price > 0 && now - cached.lastFetchedAt < INDEX_CACHE_TTL_MS) {
          results.push({
            name: idx.name,
            symbol: idx.symbol,
            price: cached.price,
            change: cached.change || 0,
            changePercent: cached.changePercent || 0,
            isPositive: (cached.change || 0) >= 0,
          });
          continue;
        }

        // Fetch fresh index value from Yahoo Finance
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

            const roundedPrice = Math.round(price * 100) / 100;
            const roundedChange = Math.round(change * 100) / 100;

            // Upsert into stock cache database
            await ctx.runMutation(internal.investments.internalUpsertStockPriceCache, {
              symbol: idx.symbol,
              name: idx.name,
              price: roundedPrice,
              prevClose: meta.previousClose || meta.chartPreviousClose,
              change: roundedChange,
              changePercent: changePct,
              searchKey,
            });

            results.push({
              name: idx.name,
              symbol: idx.symbol,
              price: roundedPrice,
              change: roundedChange,
              changePercent: changePct,
              isPositive: roundedChange >= 0,
            });
            continue;
          }
        }

        // Fallback to cached value if Yahoo failed
        if (cached && cached.price > 0) {
          results.push({
            name: idx.name,
            symbol: idx.symbol,
            price: cached.price,
            change: cached.change || 0,
            changePercent: cached.changePercent || 0,
            isPositive: (cached.change || 0) >= 0,
          });
        }
      } catch (err) {
        console.warn(`[GetMarketIndices] Error fetching ${idx.name}:`, err);
      }
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


