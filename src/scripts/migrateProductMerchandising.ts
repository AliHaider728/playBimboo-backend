import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'node:path';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import { normalizeAgeGroups } from '../lib/productContent.js';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const applyChanges = process.argv.includes('--apply');

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing');
  await mongoose.connect(process.env.MONGO_URI);
  const [products, categories] = await Promise.all([
    Product.find({}).sort({ updatedAt: -1 }).lean(),
    Category.find({}).lean()
  ]);
  const categoriesById = new Map(categories.map(category => [String(category._id), category]));
  const categoriesBySlug = new Map(categories.map(category => [String(category.slug), category]));
  const categoriesByName = new Map(categories.map(category => [String(category.name).toLowerCase(), category]));
  const operations: any[] = [];
  let spotlightKept = false;

  for (const product of products) {
    const rawIds = Array.isArray(product.categoryIds) && product.categoryIds.length > 0
      ? product.categoryIds.map(String)
      : product.categoryId ? [String(product.categoryId)] : [];
    let resolved = rawIds.map(id => categoriesById.get(id)).filter(Boolean);
    if (resolved.length === 0 && product.categorySlug) {
      const match = categoriesBySlug.get(String(product.categorySlug));
      if (match) resolved = [match];
    }
    if (resolved.length === 0 && product.category) {
      const match = categoriesByName.get(String(product.category).toLowerCase());
      if (match) resolved = [match];
    }
    const categoryIds = [...new Set(resolved.map(category => String(category!._id)))];
    const orderedCategories = categoryIds.map(id => categoriesById.get(id)!);
    let ageGroups: string[] = [];
    try {
      ageGroups = normalizeAgeGroups(product.ageGroups, product.ageGroup);
    } catch {
      ageGroups = [];
    }
    const isSpotlight = product.isSpotlight === true && !spotlightKept;
    if (isSpotlight) spotlightKept = true;
    const setFields: Record<string, unknown> = {
      categoryIds,
      categoryNames: orderedCategories.map(category => category.name),
      categorySlugs: orderedCategories.map(category => category.slug),
      isFeatured: product.isFeatured === true,
      isBestseller: product.isBestseller === true,
      isNewArrival: product.isNewArrival === true,
      isSpotlight
    };
    // Products without any historical age value remain untouched instead of
    // receiving an invalid empty canonical array.
    if (ageGroups.length > 0) setFields.ageGroups = ageGroups;
    operations.push({
      updateOne: {
        filter: { _id: product._id },
        update: { $set: setFields }
      }
    });
  }

  console.log(`${applyChanges ? 'Applying' : 'Dry run:'} ${operations.length} additive product updates.`);
  if (applyChanges && operations.length > 0) {
    const result = await Product.bulkWrite(operations, { ordered: true });
    console.log(`Migration complete. Matched ${result.matchedCount}; modified ${result.modifiedCount}.`);
  } else {
    console.log('No data was changed. Re-run with --apply after reviewing this count.');
  }
};

run()
  .catch(error => {
    console.error(error instanceof Error ? error.message : 'Product merchandising migration failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
