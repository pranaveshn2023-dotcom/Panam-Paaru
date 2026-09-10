import { query, mutation } from "./_generated/server";
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

      return {
        ...inv,
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
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const id = await ctx.db.insert("investments", {
      userId,
      name: args.name.trim(),
      assetType: args.assetType,
      investedAmount: Math.max(0, args.investedAmount),
      currentValue: Math.max(0, args.currentValue),
      units: args.units,
      buyPrice: args.buyPrice,
      currentPrice: args.currentPrice,
      sipAmount: args.sipAmount,
      sipDay: args.sipDay,
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
        buyPrice: item.buyPrice,
        currentPrice: item.currentPrice,
        sipAmount: item.sipAmount,
        sipDay: item.sipDay,
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
