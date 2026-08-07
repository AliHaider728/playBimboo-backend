const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Product = require('./dist/models/Product.js').default;
  const p = await Product.findOne({ type: 'simple' });
  if (p) {
    p.stock = 0;
    if (!p.name.includes('(Sold Out)')) {
      p.name = p.name + ' (Sold Out)';
    }
    await p.save();
    console.log('Updated ' + p.name);
  } else {
    console.log('No simple product found');
  }
  process.exit(0);
});
