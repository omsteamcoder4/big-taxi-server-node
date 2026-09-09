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
      'bigtaxi@tirupur.com',
      // some user-panel users
      'bigtaxi1@tirupur.com',
      
    ];

    await User.deleteMany({ email: { $in: emails } });

    const plain = [
      { name: 'Admin One', email: 'bigtaxi@tirupur.com', role: 'admin', password: '123tripur' },

      // user-panel users
      { name: 'Alice User', email: 'bigtaxi1@tirupur.com', role: 'user', password: '123tripur' },

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
