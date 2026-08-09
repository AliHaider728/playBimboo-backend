import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

import Review from '../models/Review.js';

const migrateReviews = async () => {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/playbimboo');
  
  console.log('Fetching all reviews...');
  const reviews = await Review.find({});
  let migratedCount = 0;

  for (const review of reviews) {
    let needsSave = false;

    // Migrate authorName -> reviewerName
    if ((review as any).authorName && !review.reviewerName) {
      review.reviewerName = (review as any).authorName;
      (review as any).authorName = undefined;
      needsSave = true;
    }

    // Migrate authorEmail -> reviewerEmail
    if ((review as any).authorEmail && !review.reviewerEmail) {
      review.reviewerEmail = (review as any).authorEmail;
      (review as any).authorEmail = undefined;
      needsSave = true;
    }

    // Migrate comment -> content
    if ((review as any).comment && !review.content) {
      review.content = (review as any).comment;
      (review as any).comment = undefined;
      needsSave = true;
    }

    // Migrate isApproved -> status
    if ((review as any).isApproved !== undefined) {
      if ((review as any).isApproved === true) {
        review.status = 'approved';
      } else if ((review as any).isApproved === false) {
        review.status = 'pending';
      }
      (review as any).isApproved = undefined;
      needsSave = true;
    }
    
    // Ensure status exists
    if (!review.status) {
      review.status = 'pending';
      needsSave = true;
    }
    
    // Ensure source exists
    if (!review.source) {
      review.source = 'customer';
      needsSave = true;
    }

    if (needsSave) {
      // Save using Mongoose which will also trigger the pre-save hooks
      await review.save();
      migratedCount++;
    }
  }

  console.log(`Migration complete. Migrated ${migratedCount} reviews.`);
  await mongoose.disconnect();
};

migrateReviews().catch(console.error);
