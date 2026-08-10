const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = mongoose.connection.collection('users');
  const user = await User.findOne({});
  if (!user) {
    console.log('No users found in database');
    process.exit(0);
  }
  console.log('Found user:', user.email);
  const newPass = 'test1234';
  const hash = await bcrypt.hash(newPass, 10);
  console.log('original password hash length:', user.passwordHash ? user.passwordHash.length : 'none');
  console.log('new password hash length:', hash.length);
  await User.updateOne({ _id: user._id }, { $set: { passwordHash: hash } });
  
  const user2 = await User.findOne({ email: user.email });
  const match = await bcrypt.compare(newPass, user2.passwordHash);
  console.log('bcrypt compare works?', match);
  process.exit(0);
}
test().catch(console.error);
