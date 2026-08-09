import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Review from '../models/Review.js';
import Product from '../models/Product.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in environment variables.');
  process.exit(1);
}

const reviewsData = [
  {
    productSlug: 'rc-mini-drifting-car',
    reviews: [
      { reviewerName: 'Ayesha Khan', rating: 5, title: 'My son can\'t put it down!', content: 'Bought this for my 6 year old\'s birthday and he has been obsessed ever since. The drifting mode is so much fun to watch, and the LED lights make it even cooler at night. Great build quality for the price.', verifiedPurchase: true },
      { reviewerName: 'Bilal Ahmed', rating: 5, title: 'Excellent value for money', content: 'Was skeptical about ordering online but this exceeded expectations. The remote control response is smooth and the follow mode feature is a fun surprise. Delivery was quick too.', verifiedPurchase: true },
      { reviewerName: 'Sana Malik', rating: 4, title: 'Good car, battery could last longer', content: 'Kids absolutely love it, especially the escape mode. Only complaint is the battery drains a bit fast, so we bought a spare. Otherwise a solid toy.', verifiedPurchase: true },
      { reviewerName: 'Hassan Raza', rating: 5, title: 'Perfect gift', content: 'Got this as a surprise gift for my nephew. He was so happy, played with it non-stop the whole day. The music and sound effects are a nice touch.', verifiedPurchase: true },
      { reviewerName: 'Fatima Sheikh', rating: 4, title: 'Fun for the whole family', content: 'Even I enjoyed trying the drift modes with my daughter. Packaging was neat and product looked exactly like the pictures. Would recommend to other parents.', verifiedPurchase: false },
      { reviewerName: 'Usman Tariq', rating: 5, title: 'Best RC car we\'ve bought', content: 'We\'ve tried a few cheap RC cars before but this one is by far the best. Strong motor, good control range, and the LED headlights are a great detail.', verifiedPurchase: true }
    ]
  },
  {
    productSlug: 'gyro-rc-form-fighter-jet',
    reviews: [
      { reviewerName: 'Ahmed Ali', rating: 5, title: 'Flies really well!', content: 'My kids fight over whose turn it is to fly this jet. Stable in the air, easy to control with the 2.4GHz remote, and the LED lights look amazing when flying at dusk.', verifiedPurchase: true },
      { reviewerName: 'Zainab Hussain', rating: 4, title: 'Great for beginners', content: 'First time buying a flying toy and this made it easy. Took a few tries to get used to the controls but the 360 flip feature is super fun once you get the hang of it.', verifiedPurchase: true },
      { reviewerName: 'Omar Farooq', rating: 5, title: 'Sturdy and well built', content: 'The propeller guards actually make a difference — my son crashed it a few times and it survived without any damage. Great value for the price.', verifiedPurchase: true },
      { reviewerName: 'Mehwish Iqbal', rating: 5, title: 'Worth every rupee', content: 'Bought this after seeing it recommended by a friend. Extremely happy with the quality. Charging is quick and flight time is decent for a toy in this range.', verifiedPurchase: true },
      { reviewerName: 'Kashif Nawaz', rating: 4, title: 'Fun toy, needs open space', content: 'Works best outdoors or in a large room. Indoors it\'s a bit tricky to control. Kids love the design though, looks like a real fighter jet.', verifiedPurchase: false },
      { reviewerName: 'Sadia Yousuf', rating: 5, title: 'Amazing gift for my son', content: 'My 8 year old is obsessed with planes and this was the perfect gift. He\'s already learned to do the flips on his own. Highly recommend.', verifiedPurchase: true }
    ]
  },
  {
    productSlug: 'magnetic-building-blocks',
    reviews: [
      { reviewerName: 'Nadia Chaudhry', rating: 5, title: 'Amazing for creativity', content: 'My daughter builds something new every single day with this set. The magnetic connection is strong and pieces don\'t fall apart easily. Really improves her focus and imagination.', verifiedPurchase: true },
      { reviewerName: 'Imran Shah', rating: 5, title: 'Educational and fun', content: 'Bought the 64 piece set and it\'s been great for both my kids to play together. Good quality material, feels safe and durable, no sharp edges.', verifiedPurchase: true },
      { reviewerName: 'Rabia Aslam', rating: 4, title: 'Great STEM toy', content: 'Really happy with this purchase. Helps with motor skills and my son enjoys building different shapes. Wish it came with an instruction booklet for more design ideas.', verifiedPurchase: true },
      { reviewerName: 'Farhan Siddiqui', rating: 5, title: 'Kids and adults both enjoy it', content: 'Honestly even I sit and build things with my kids now. Great quality magnets, doesn\'t feel cheap at all. Worth the price.', verifiedPurchase: true },
      { reviewerName: 'Hina Baig', rating: 5, title: 'Screen-free entertainment win', content: 'This has been a lifesaver for keeping my toddler engaged without screens. Safe material and colorful pieces keep her interested for hours.', verifiedPurchase: false },
      { reviewerName: 'Tariq Mehmood', rating: 4, title: 'Good set, slightly pricey', content: 'Quality is very good and my kids love building towers and shapes with it. A bit expensive compared to local alternatives but worth it for the safety and durability.', verifiedPurchase: true }
    ]
  },
  {
    productSlug: '360-rc-stunt-car',
    reviews: [
      { reviewerName: 'Waleed Anjum', rating: 5, title: 'Incredible stunts!', content: 'The 360 spins and rotation features are so much fun to watch. My son plays with it every evening after school. Strong build and great remote range.', verifiedPurchase: true },
      { reviewerName: 'Amna Riaz', rating: 4, title: 'Great stunt car for the price', content: 'Does everything as advertised — flips, spins, and rotates smoothly. Battery life is decent, lasts around 20-25 minutes of continuous play.', verifiedPurchase: true },
      { reviewerName: 'Junaid Akhtar', rating: 5, title: 'My kids love the LED wheels', content: 'The colorful LED wheels are a huge hit with my kids, especially at night. Very responsive controls and looks exactly like the pictures.', verifiedPurchase: true },
      { reviewerName: 'Sobia Kamal', rating: 5, title: 'Best purchase for my son\'s birthday', content: 'He was so excited when he opened this. The stunt features work really well and it\'s tough enough to survive a few crashes into the wall.', verifiedPurchase: true },
      { reviewerName: 'Adeel Rashid', rating: 4, title: 'Fun but takes some practice', content: 'Took my daughter a little while to master the stunts but once she did, she couldn\'t stop playing. Good quality overall, satisfied with the purchase.', verifiedPurchase: false },
      { reviewerName: 'Maria Naeem', rating: 5, title: 'Highly recommend', content: 'Fantastic quality and design. Rechargeable battery is a great feature, saves money in the long run. My son shows it off to all his friends.', verifiedPurchase: true }
    ]
  }
];

async function insertManualReviews() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI as string);
    console.log('Connected.');

    for (const group of reviewsData) {
      const product = await Product.findOne({ slug: group.productSlug });
      if (!product) {
        console.error(`Product not found for slug: ${group.productSlug}`);
        continue;
      }
      
      console.log(`\nFound product: ${product.name}. Inserting ${group.reviews.length} reviews...`);
      
      for (const rev of group.reviews) {
        const reviewData = {
          productId: String(product._id),
          productName: product.name,
          reviewerName: rev.reviewerName,
          title: rev.title,
          content: rev.content,
          rating: rev.rating,
          verifiedPurchase: rev.verifiedPurchase,
          status: 'approved',
          source: 'customer'
        };

        try {
          await Review.create(reviewData);
          console.log(`  + Inserted review by ${rev.reviewerName}`);
        } catch (err: any) {
          console.error(`  - Failed to insert review by ${rev.reviewerName}:`, err.message);
        }
      }
    }

    console.log('\nFinished inserting manual reviews.');
    process.exit(0);

  } catch (error: any) {
    console.error('\nScript failed:', error.message);
    process.exit(1);
  }
}

insertManualReviews();
