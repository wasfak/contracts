import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * A single line item from an uploaded pharmacy report (SofTech Smart Business).
 * Both purchases ("الأصناف التى تم شراؤها") and sales ("مبيعات الأصناف")
 * are stored in one collection, distinguished by `kind`.
 *
 * Numeric fields keep their original sign — negative values represent
 * returns / credits to the supplier.
 */
const TransactionSchema = new Schema(
  {
    kind: { type: String, enum: ["purchase", "sale"], required: true },

    code: { type: String, required: true }, // كود الصنف — join key across reports
    name: { type: String, required: true }, // إسم الصنف
    supplier: { type: String, default: "" }, // المورد / المورد الرئيسي
    pharmacy: { type: String, default: "" }, // صيدلية

    quantity: { type: Number, default: 0 }, // الكمية / إجمالي كمية

    // purchases use `amount` as الإجمالي, sales use it as المبلغ (revenue)
    amount: { type: Number, default: 0 },

    // purchases only: متوسط تكلفة الوحدة
    unitCost: { type: Number, default: null },

    // sales only: مبلغ الربح
    profit: { type: Number, default: null },

    // الفترة من / إلى — when the item was bought or sold
    periodFrom: { type: Date, required: true },
    periodTo: { type: Date, required: true },
  },
  { timestamps: true }
);

// One row per (kind, code, supplier, period) — purchases have multiple suppliers
// per code so supplier must be part of the key.
TransactionSchema.index(
  { kind: 1, code: 1, supplier: 1, periodFrom: 1, periodTo: 1 },
  { unique: true }
);

export type TransactionDoc = InferSchemaType<typeof TransactionSchema>;

export const Transaction: Model<TransactionDoc> =
  (mongoose.models.Transaction as Model<TransactionDoc>) ||
  mongoose.model<TransactionDoc>("Transaction", TransactionSchema);
