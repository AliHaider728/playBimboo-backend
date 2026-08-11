
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  try {
    const UserSchema = new mongoose.Schema({
      name: { type: String, required: true },
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      passwordHash: { type: String, required: true },
      role: { type: String, enum: ['super_admin', 'admin', 'customer'], default: 'customer' }
    }, { strict: false });
    
    const User = mongoose.models.User || mongoose.model('User', UserSchema);

    const email = 'playbimboo@gmail.com';
    const password = 'admin123';
    const passwordHash = await bcrypt.hash(password, 10);

    let admin = await User.findOne({ email });
    
    if (admin) {
      admin.passwordHash = passwordHash;
      admin.role = 'super_admin';
      await admin.save();
      console.log('Admin user updated successfully.');
    } else {
      admin = new User({
        name: 'Admin',
        email,
        passwordHash,
        role: 'super_admin'
      });
      await admin.save();
      console.log('Admin user created successfully.');
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
});

