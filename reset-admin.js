const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = "mongodb://playbimbootoys_db_user:MMUh1mpkJYzSpbLG@ac-a1afkwu-shard-00-00.ymzcmpq.mongodb.net:27017,ac-a1afkwu-shard-00-01.ymzcmpq.mongodb.net:27017,ac-a1afkwu-shard-00-02.ymzcmpq.mongodb.net:27017/playbimbooToys?ssl=true&replicaSet=atlas-iozg07-shard-0&authSource=admin&retryWrites=true&w=majority";

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  passwordHash: String,
  role: { type: String, default: 'customer' }
});
const User = mongoose.model('User', userSchema);

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const email = 'playbimboo@gmail.com';
  const plainPassword = 'admin123';
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  let user = await User.findOne({ email });
  if (user) {
    user.passwordHash = passwordHash;
    user.role = 'admin';
    await user.save();
    console.log('User updated successfully');
  } else {
    await User.create({
      name: 'PlayBimboo Super Admin',
      email,
      passwordHash,
      role: 'admin'
    });
    console.log('User created successfully');
  }

  await mongoose.disconnect();
}

run().catch(console.error);
