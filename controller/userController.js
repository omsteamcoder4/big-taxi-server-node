
import User from '../models/userModel.js';

/**
 * Get profile for current logged-in user
 */
export const getProfile = async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId).select('-password');
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json(user);
};
