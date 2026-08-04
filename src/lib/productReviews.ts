import Product from '../models/Product.js';
import Review from '../models/Review.js';

export interface ReviewSummary {
  rating: number;
  reviewCount: number;
}

const EMPTY_SUMMARY: ReviewSummary = { rating: 0, reviewCount: 0 };

export const getApprovedReviewSummaries = async (products: Array<Record<string, any>>) => {
  const productTokens = products.flatMap(product => [
    String(product._id || product.id || ''),
    String(product.slug || '')
  ]).filter(Boolean);
  const reviews = productTokens.length > 0
    ? await Review.find({ productId: { $in: productTokens }, isApproved: true }).select('productId rating').lean()
    : [];

  return new Map(products.map(product => {
    const id = String(product._id || product.id || '');
    const slug = String(product.slug || '');
    const matching = reviews.filter(review => review.productId === id || review.productId === slug);
    if (matching.length === 0) return [id, { ...EMPTY_SUMMARY }];
    const average = matching.reduce((sum, review) => sum + Number(review.rating || 0), 0) / matching.length;
    return [id, { rating: Number(average.toFixed(1)), reviewCount: matching.length }];
  }));
};

export const recalculateProductReviewSummary = async (productId: string) => {
  const product = /^[0-9a-f]{24}$/i.test(productId)
    ? await Product.findById(productId).select('_id slug')
    : await Product.findOne({ slug: productId }).select('_id slug');
  if (!product) return { ...EMPTY_SUMMARY };
  const summaries = await getApprovedReviewSummaries([product.toObject()]);
  const summary = summaries.get(String(product.id)) || { ...EMPTY_SUMMARY };
  await Product.findByIdAndUpdate(product.id, summary);
  return summary;
};
