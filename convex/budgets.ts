import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { getActiveBudgetPeriod, RecurrenceFrequency } from "./engine/recurrence";

export const listWithProgress = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const budgets = await ctx.db
      .query("budgets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    if (budgets.length === 0) return [];

    // Fetch all user expense transactions to compute period spend
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_user_type", (q) => q.eq("userId", userId).eq("type", "expense"))
      .collect();

    // Fetch user wallets for source wallet metadata
    const wallets = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const walletMap = new Map(wallets.map((w) => [w._id, w]));

    const now = new Date();

    return budgets.map((budget) => {
      const activePeriod = getActiveBudgetPeriod(
        budget.startDate,
        budget.recurrence as RecurrenceFrequency,
        now
      );

      // Sum expenses for this budget category strictly within the active period
      const matchingTxs = transactions.filter((tx) => {
        if (tx.category !== budget.category) return false;
        return tx.date >= activePeriod.startDate && tx.date <= activePeriod.endDate;
      });

      const effectiveTotalPool = (budget.currentLoadedAmount ?? budget.initialLoadedAmount) ?? budget.amount;
      const spentAmount = matchingTxs.reduce((sum, tx) => sum + tx.amount, 0);
      const remainingAmount = Math.max(0, effectiveTotalPool - spentAmount);
      const progressPercent = effectiveTotalPool > 0 ? Math.min(100, Math.round((spentAmount / effectiveTotalPool) * 100)) : 0;
      const remainingPercent = 100 - progressPercent;
      const isOverBudget = spentAmount > effectiveTotalPool;

      // Low balance warning triggers (Dual Thresholds: Percent OR Amount)
      const isLowAmount =
        budget.lowBalanceThresholdAmount !== undefined &&
        budget.lowBalanceThresholdAmount > 0 &&
        remainingAmount <= budget.lowBalanceThresholdAmount;

      const isLowPercent =
        budget.lowBalanceThresholdPercent !== undefined &&
        budget.lowBalanceThresholdPercent > 0 &&
        remainingPercent <= budget.lowBalanceThresholdPercent;

      const defaultWarning = progressPercent >= (budget.alertThreshold ?? 80);
      const isWarning = (isLowAmount || isLowPercent || defaultWarning) && !isOverBudget;

      const sourceWallet = budget.sourceWalletId ? walletMap.get(budget.sourceWalletId) : undefined;

      return {
        ...budget,
        effectiveTotalPool,
        activePeriod,
        spentAmount,
        remainingAmount,
        progressPercent,
        remainingPercent,
        isOverBudget,
        isWarning,
        isLowAmount,
        isLowPercent,
        transactionCount: matchingTxs.length,
        sourceWalletName: sourceWallet?.name,
        sourceWalletColor: sourceWallet?.color,
        sourceWalletType: sourceWallet?.type,
      };
    });
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    amount: v.number(),
    initialLoadedAmount: v.optional(v.number()),
    category: v.string(),
    recurrence: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("quarterly"),
      v.literal("yearly")
    ),
    startDate: v.string(),
    sourceWalletId: v.optional(v.id("wallets")),
    autoDeductFromWallet: v.optional(v.boolean()),
    alertThreshold: v.optional(v.number()),
    lowBalanceThresholdAmount: v.optional(v.number()),
    lowBalanceThresholdPercent: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    if (args.amount <= 0 && (!args.initialLoadedAmount || args.initialLoadedAmount <= 0)) {
      throw new Error("Budget limit or loaded amount must be greater than 0");
    }

    const initialLoaded = args.initialLoadedAmount ?? args.amount;
    const now = Date.now();

    // If source wallet is chosen with auto-deduct enabled, deduct initial pool immediately
    if (args.sourceWalletId && args.autoDeductFromWallet) {
      const wallet = await ctx.db.get(args.sourceWalletId);
      if (wallet && wallet.userId === userId) {
        await ctx.db.patch(args.sourceWalletId, {
          balance: wallet.balance - initialLoaded,
          updatedAt: now,
        });

        // Record an initial budget allocation transaction
        await ctx.db.insert("transactions", {
          userId,
          title: `Budget Allocated: ${args.name.trim()}`,
          amount: initialLoaded,
          type: "expense",
          category: args.category,
          date: args.startDate.slice(0, 10),
          notes: `Auto-allocated from wallet: ${wallet.name}`,
          walletId: args.sourceWalletId,
          createdAt: now,
        });
      }
    }

    return await ctx.db.insert("budgets", {
      userId,
      name: args.name.trim(),
      amount: args.amount,
      initialLoadedAmount: initialLoaded,
      currentLoadedAmount: initialLoaded,
      category: args.category,
      recurrence: args.recurrence,
      startDate: args.startDate,
      sourceWalletId: args.sourceWalletId,
      autoDeductFromWallet: args.autoDeductFromWallet ?? false,
      lastDeductedPeriodIndex: 0,
      alertThreshold: args.alertThreshold ?? 80,
      lowBalanceThresholdAmount: args.lowBalanceThresholdAmount,
      lowBalanceThresholdPercent: args.lowBalanceThresholdPercent,
      isActive: true,
      createdAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("budgets"),
    name: v.string(),
    amount: v.number(),
    initialLoadedAmount: v.optional(v.number()),
    category: v.string(),
    recurrence: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("quarterly"),
      v.literal("yearly")
    ),
    startDate: v.string(),
    sourceWalletId: v.optional(v.id("wallets")),
    autoDeductFromWallet: v.optional(v.boolean()),
    alertThreshold: v.optional(v.number()),
    lowBalanceThresholdAmount: v.optional(v.number()),
    lowBalanceThresholdPercent: v.optional(v.number()),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const budget = await ctx.db.get(args.id);
    if (!budget || budget.userId !== userId) {
      throw new Error("Budget not found or unauthorized");
    }

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      amount: args.amount,
      initialLoadedAmount: args.initialLoadedAmount ?? budget.initialLoadedAmount,
      category: args.category,
      recurrence: args.recurrence,
      startDate: args.startDate,
      sourceWalletId: args.sourceWalletId,
      autoDeductFromWallet: args.autoDeductFromWallet,
      alertThreshold: args.alertThreshold ?? 80,
      lowBalanceThresholdAmount: args.lowBalanceThresholdAmount,
      lowBalanceThresholdPercent: args.lowBalanceThresholdPercent,
      isActive: args.isActive,
    });

    return { success: true };
  },
});

export const topUp = mutation({
  args: {
    id: v.id("budgets"),
    topUpAmount: v.number(),
    walletId: v.optional(v.id("wallets")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    if (args.topUpAmount <= 0) {
      throw new Error("Top-up amount must be greater than 0");
    }

    const budget = await ctx.db.get(args.id);
    if (!budget || budget.userId !== userId) {
      throw new Error("Budget not found or unauthorized");
    }

    const now = Date.now();
    const currentTotal = (budget.currentLoadedAmount ?? budget.initialLoadedAmount) ?? budget.amount;
    const newTotal = currentTotal + args.topUpAmount;

    // Deduct top-up amount from wallet if provided
    const fundingWalletId = args.walletId || budget.sourceWalletId;
    if (fundingWalletId) {
      const wallet = await ctx.db.get(fundingWalletId);
      if (wallet && wallet.userId === userId) {
        await ctx.db.patch(fundingWalletId, {
          balance: wallet.balance - args.topUpAmount,
          updatedAt: now,
        });

        // Record a top-up transaction
        await ctx.db.insert("transactions", {
          userId,
          title: `Budget Top-up: ${budget.name}`,
          amount: args.topUpAmount,
          type: "expense",
          category: budget.category,
          date: new Date().toISOString().slice(0, 10),
          notes: `Top-up loaded into budget pocket from ${wallet.name}`,
          walletId: fundingWalletId,
          budgetId: budget._id,
          createdAt: now,
        });
      }
    }

    await ctx.db.patch(args.id, {
      currentLoadedAmount: newTotal,
    });

    return { success: true, newLoadedAmount: newTotal };
  },
});

export const checkAndRenewRecurringBudgets = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { renewedCount: 0 };

    const budgets = await ctx.db
      .query("budgets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    let renewedCount = 0;
    const now = new Date();
    const nowTimestamp = Date.now();

    for (const budget of budgets) {
      if (!budget.sourceWalletId || !budget.autoDeductFromWallet) continue;

      const activePeriod = getActiveBudgetPeriod(
        budget.startDate,
        budget.recurrence as RecurrenceFrequency,
        now
      );

      const lastDeducted = budget.lastDeductedPeriodIndex ?? 0;
      if (activePeriod.periodIndex > lastDeducted) {
        const wallet = await ctx.db.get(budget.sourceWalletId);
        if (wallet && wallet.userId === userId) {
          // Deduct recurring cycle amount from wallet
          await ctx.db.patch(budget.sourceWalletId, {
            balance: wallet.balance - budget.amount,
            updatedAt: nowTimestamp,
          });

          // Record cycle deduction transaction
          await ctx.db.insert("transactions", {
            userId,
            title: `Recurring Budget Renewed: ${budget.name}`,
            amount: budget.amount,
            type: "expense",
            category: budget.category,
            date: activePeriod.startDate,
            notes: `Auto-renewed for cycle (${activePeriod.startDate} - ${activePeriod.endDate}) from ${wallet.name}`,
            walletId: budget.sourceWalletId,
            budgetId: budget._id,
            createdAt: nowTimestamp,
          });

          // Reset budget pool for the new cycle
          await ctx.db.patch(budget._id, {
            currentLoadedAmount: budget.amount,
            lastDeductedPeriodIndex: activePeriod.periodIndex,
          });

          renewedCount++;
        }
      }
    }

    return { renewedCount };
  },
});

export const remove = mutation({
  args: {
    id: v.id("budgets"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const budget = await ctx.db.get(args.id);
    if (!budget || budget.userId !== userId) {
      throw new Error("Budget not found or unauthorized");
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});
