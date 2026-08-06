import GlobalAttribute from '../models/GlobalAttribute.js';
import { IProductAttribute } from '../models/Product.js';

/**
 * Syncs product attributes with their global counterparts.
 * This ensures the product snapshot is always up-to-date with labels, colors, and images.
 */
export async function syncProductGlobalAttributes(attributes: any[]): Promise<any[]> {
  if (!Array.isArray(attributes)) return [];

  const syncedAttributes = [];

  for (const attr of attributes) {
    if (attr.source === 'global' && attr.globalAttributeId) {
      const globalAttr = await GlobalAttribute.findOne({ id: attr.globalAttributeId });
      
      if (globalAttr) {
        // Build the latest terms from the selectedTermIds
        const selectedIds = Array.isArray(attr.selectedTermIds) ? attr.selectedTermIds : [];
        const syncedTerms = globalAttr.terms
          .filter(t => selectedIds.includes(t.id))
          .map(t => ({
            id: t.id,
            label: t.label,
            slug: t.slug,
            value: t.value,
            colorValue: t.colorValue,
            imageUrl: t.imageUrl,
            imageAlt: t.imageAlt,
            position: t.position
          }));

        syncedAttributes.push({
          ...attr,
          name: globalAttr.name, // sync name and slug
          slug: globalAttr.slug,
          displayType: attr.displayTypeOverride || globalAttr.displayType, // respect override
          terms: syncedTerms, // overwrite terms with fresh snapshots
        });
        continue;
      }
    }
    
    // If custom or global not found, push as-is
    syncedAttributes.push(attr);
  }

  return syncedAttributes;
}
