import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import Product from '../models/Product';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const DRY_RUN = process.argv.includes('--dry-run');

async function runMigration() {
  console.log(`Starting Product Migration V2 ${DRY_RUN ? '(DRY RUN)' : '(LIVE RUN)'}`);
  
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is missing');
    process.exit(1);
  }

  let unchanged = 0;
  let migratedSimple = 0;
  let migratedVariable = 0;
  let repairedPartialV2 = 0;
  let skipped = 0;
  let hasErrors = false;

  // Helper to generate Cartesian product of options
  function cartesianProduct(groups: any[]) {
    if (groups.length === 0) return [[]];
    const result: any[] = [];
    const rest = cartesianProduct(groups.slice(1));
    for (const option of groups[0].options) {
      for (const combination of rest) {
        result.push([{ groupSlug: groups[0].slug, option }, ...combination]);
      }
    }
    return result;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const products = await Product.find({});
    console.log(`Found ${products.length} products`);

    for (const product of products) {
      try {
        const isV2 = product.productSchemaVersion === 2;
        let isWellFormedV2 = false;
        let needsRepair = false;

        if (isV2) {
          if (product.productType === 'simple') {
            isWellFormedV2 = true;
          } else if (product.productType === 'variable') {
            const hasAttributes = Array.isArray(product.attributes) && product.attributes!.length > 0;
            const hasVariations = Array.isArray(product.variations) && product.variations!.length > 0;
            
            if (hasAttributes && hasVariations) {
              const allAttrsHaveIds = product.attributes!.every((a: any) => a.id && Array.isArray(a.terms) && a.terms.every((t: any) => t.id));
              const allVarsHaveIds = product.variations!.every((v: any) => v.id && v.attributes);
              if (allAttrsHaveIds && allVarsHaveIds) {
                isWellFormedV2 = true;
              } else {
                needsRepair = true;
              }
            } else {
              needsRepair = true;
            }
          } else {
             isWellFormedV2 = true;
          }
        }

        if (isV2 && isWellFormedV2) {
          unchanged++;
          continue;
        }

        if (isV2 && needsRepair) {
           if (product.productType === 'variable') {
             product.attributes?.forEach((attr: any) => {
               if (!attr.id) attr.id = randomUUID();
               attr.terms?.forEach((term: any) => {
                 if (!term.id) term.id = randomUUID();
               });
             });
             product.variations?.forEach((v: any) => {
               if (!v.id) v.id = randomUUID();
             });
           }
           if (!DRY_RUN) await product.save();
           repairedPartialV2++;
           console.log(`[REPAIRED] Fixed partial V2 product ${product.slug}`);
           continue;
        }

        if (!product.variants || product.variants.length === 0) {
          product.productType = 'simple';
          product.attributes = [];
          product.variations = [];
          product.defaultAttributes = {};
          product.productSchemaVersion = 2;
          if (!DRY_RUN) await product.save();
          migratedSimple++;
          console.log(`[SIMPLE] Migrated ${product.slug}. Legacy variants untouched.`);
        } else {
          product.productType = 'variable';
          const newAttributes: any[] = [];
          
          const groupsWithSlugs = product.variants.map((group, position) => {
            const slug = group.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const terms = group.options.map((opt: any, optIdx: number) => ({
              id: opt.id || randomUUID(), // Preserve legacy option ID as term ID!
              label: opt.name,
              slug: opt.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              value: opt.name,
              position: optIdx
            }));
            newAttributes.push({
              source: 'custom',
              id: group.id || randomUUID(),
              name: group.name,
              slug,
              displayType: 'buttons',
              terms,
              visible: true,
              usedForVariations: true,
              position
            });
            return { slug, options: group.options };
          });

          // Generate combinations
          const combinations = cartesianProduct(groupsWithSlugs);
          const newVariations: any[] = [];

          for (const combination of combinations) {
            const attrs: Record<string, string> = {};
            let priceOffsetSum = 0;
            let combinedSku = product.sku || 'PB';
            let trackInv = false;
            let stockQty: number | null = null;
            let isFirstOption = true;

            for (const item of combination) {
              attrs[item.groupSlug] = item.option.name;
              priceOffsetSum += item.option.priceOffset || 0;
              
              if (item.option.sku) {
                 combinedSku += '-' + item.option.sku;
              } else {
                 combinedSku += '-' + item.option.name.toUpperCase().replace(/\s+/g, '');
              }

              if (item.option.trackInventory) {
                trackInv = true;
                if (stockQty === null || (item.option.stockQuantity !== null && item.option.stockQuantity < stockQty)) {
                  stockQty = item.option.stockQuantity;
                }
              }
            }

            // If it's a 1-dimensional array, preserve the option ID as variation ID if possible, else random
            const varId = combination.length === 1 ? (combination[0].option.id || randomUUID()) : randomUUID();

            newVariations.push({
              id: varId,
              attributes: attrs,
              enabled: true,
              sku: combinedSku,
              regularPrice: product.price + priceOffsetSum,
              salePrice: undefined,
              manageStock: trackInv,
              stockQuantity: stockQty,
              lowStockThreshold: null,
              stockStatus: (trackInv && stockQty !== null && stockQty <= 0) ? 'out_of_stock' : 'in_stock'
            });
          }

          product.attributes = newAttributes;
          product.variations = newVariations;
          
          const defaultAttrs: Record<string, string> = {};
          if (newVariations.length > 0) {
            for (const [k, v] of Object.entries(newVariations[0].attributes)) {
              defaultAttrs[k] = v as string;
            }
          }
          product.defaultAttributes = defaultAttrs;
          product.productSchemaVersion = 2;

          if (!DRY_RUN) await product.save();
          migratedVariable++;
          console.log(`[VARIABLE] Migrated ${product.slug} (${newVariations.length} variations). Legacy data preserved.`);
        }
      } catch (err: any) {
        skipped++;
        hasErrors = true;
        console.error(`[ERROR] Skipped product ID ${product._id} (${product.slug}): ${err.message}`);
      }
    }

    console.log('\n--- Migration Summary ---');
    console.log(`Total Products: ${products.length}`);
    console.log(`Already V2: ${unchanged}`);
    console.log(`Migrated as Simple: ${migratedSimple}`);
    console.log(`Migrated as Variable: ${migratedVariable}`);
    console.log(`Repaired Partial V2: ${repairedPartialV2}`);
    console.log(`Skipped with Errors: ${skipped}`);
    
    if (DRY_RUN) {
      console.log('\nTHIS WAS A DRY RUN. NO DATA WAS SAVED.');
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(skipped > 0 || process.exitCode === 1 ? 1 : 0);
  }
}

runMigration();
