// seeder.js
// Run: node seeder.js
import bcrypt from 'bcryptjs';
import { initDB } from './app.js';
import User from './models/userModel.js';

const seed = async () => {
  try {
    await initDB();

    console.log('Seeding users...');

    // Remove existing sample accounts that we will re-create (be careful in prod!)
    const emails = [
      'admin@example.com',
      // some user-panel users
      'admin1@example.com',
      
    ];

    await User.deleteMany({ email: { $in: emails } });

    const plain = [
      { name: 'Admin One', email: 'admin@example.com', role: 'admin', password: 'admin123' },

      // user-panel users
      { name: 'Alice User', email: 'admin1@example.com', role: 'user', password: 'admin123' },

    ];

    for (const u of plain) {
      const hash = await bcrypt.hash(u.password, 10);
      await User.create({
        name: u.name,
        email: u.email,
        password: hash,
        role: u.role,
        active: true
      });
      console.log(`Created ${u.email} (${u.role})`);
    }

    console.log('Seeding complete.');
    process.exit(0);
  } catch (err) {
    console.error('Seeding error', err);
    process.exit(1);
  }
};

seed();
