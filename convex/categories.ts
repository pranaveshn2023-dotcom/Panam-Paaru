import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { DEFAULT_CATEGORIES } from "./users";

/**
 * List all categories for the authenticated user.
 * If user has no categories initialized yet, automatically provisions default categories.
 */
export const list = query({
  args: {
    type: v.optional(v.union(v.literal("income"), v.literal("expense"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    let categories = await ctx.db
      .query("categories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    if (categories.length === 0) {
      // Fallback: return default categories structure if DB empty
      const defs = DEFAULT_CATEGORIES.map((c) => ({
        ...c,
        isCustom: false,
        userId,
      }));
      if (args.type) {
        return defs.filter((c) => c.type === args.type);
      }
      return defs;
    }

    if (args.type) {
      categories = categories.filter((c) => c.type === args.type);
    }

    // Sort: custom items first, then alphabetical by name
    return categories.sort((a, b) => {
      if (Boolean(a.isCustom) !== Boolean(b.isCustom)) {
        return a.isCustom ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  },
});

/**
 * List categories with usage stats (transaction count and total sum).
 */
export const listWithStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const statsMap = new Map<string, { count: number; total: number }>();

    for (const tx of transactions) {
      const current = statsMap.get(tx.category) || { count: 0, total: 0 };
      current.count += 1;
      current.total += tx.amount;
      statsMap.set(tx.category, current);
    }

    return categories.map((c) => ({
      ...c,
      transactionCount: statsMap.get(c.name)?.count || 0,
      totalAmount: statsMap.get(c.name)?.total || 0,
    }));
  },
});

/**
 * Create a new custom category (Income or Expense).
 */
export const create = mutation({
  args: {
    name: v.string(),
    type: v.union(v.literal("income"), v.literal("expense")),
    color: v.string(),
    icon: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const trimmedName = args.name.trim();
    if (!trimmedName) throw new Error("Category name cannot be empty");

    // Check duplicate for this user & type
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) =>
        q.and(
          q.eq(q.field("type"), args.type),
          q.eq(q.field("name"), trimmedName)
        )
      )
      .first();

    if (existing) {
      throw new Error(`A category named "${trimmedName}" already exists for ${args.type}`);
    }

    return await ctx.db.insert("categories", {
      userId,
      name: trimmedName,
      type: args.type,
      color: args.color,
      icon: args.icon,
      isCustom: true,
    });
  },
});

/**
 * Update an existing category (name, color, icon, type).
 * Automatically cascades name updates to existing transactions & budgets.
 */
export const update = mutation({
  args: {
    id: v.id("categories"),
    name: v.string(),
    type: v.union(v.literal("income"), v.literal("expense")),
    color: v.string(),
    icon: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const category = await ctx.db.get(args.id);
    if (!category || category.userId !== userId) {
      throw new Error("Category not found");
    }

    const trimmedName = args.name.trim();
    if (!trimmedName) throw new Error("Category name cannot be empty");

    // Check collision with another category
    if (trimmedName.toLowerCase() !== category.name.toLowerCase() || args.type !== category.type) {
      const existing = await ctx.db
        .query("categories")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .filter((q) =>
          q.and(
            q.neq(q.field("_id"), args.id),
            q.eq(q.field("type"), args.type),
            q.eq(q.field("name"), trimmedName)
          )
        )
        .first();

      if (existing) {
        throw new Error(`A category named "${trimmedName}" already exists for ${args.type}`);
      }
    }

    const oldName = category.name;

    // Cascade name changes across transactions and budgets
    if (oldName !== trimmedName) {
      const userTransactions = await ctx.db
        .query("transactions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .filter((q) => q.eq(q.field("category"), oldName))
        .collect();

      for (const tx of userTransactions) {
        await ctx.db.patch(tx._id, { category: trimmedName });
      }

      const userBudgets = await ctx.db
        .query("budgets")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .filter((q) => q.eq(q.field("category"), oldName))
        .collect();

      for (const b of userBudgets) {
        await ctx.db.patch(b._id, { category: trimmedName });
      }
    }

    await ctx.db.patch(args.id, {
      name: trimmedName,
      type: args.type,
      color: args.color,
      icon: args.icon,
    });

    return args.id;
  },
});

/**
 * Remove a category.
 * Reassigns any associated transactions or budgets to a fallback category (default: 'Other Expense' or 'Other Income').
 */
export const remove = mutation({
  args: {
    id: v.id("categories"),
    reassignTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const category = await ctx.db.get(args.id);
    if (!category || category.userId !== userId) {
      throw new Error("Category not found");
    }

    const fallback =
      args.reassignTo || (category.type === "expense" ? "Other Expense" : "Other Income");

    // Reassign transactions
    const affectedTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("category"), category.name))
      .collect();

    for (const tx of affectedTransactions) {
      await ctx.db.patch(tx._id, { category: fallback });
    }

    // Reassign budgets
    const affectedBudgets = await ctx.db
      .query("budgets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("category"), category.name))
      .collect();

    for (const b of affectedBudgets) {
      await ctx.db.patch(b._id, { category: fallback });
    }

    await ctx.db.delete(args.id);

    return {
      success: true,
      reassignedTransactionsCount: affectedTransactions.length,
      reassignedBudgetsCount: affectedBudgets.length,
    };
  },
});
