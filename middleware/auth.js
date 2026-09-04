// appfolder/middleware/auth.js
import jwt from 'jsonwebtoken';

export const protect = async (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });

    const token = auth.split(' ')[1];
    const secret = global.JWT_SECRET;
    if (!secret) throw new Error('JWT secret not configured');

    const payload = jwt.verify(token, secret);
    req.user = { id: payload.id, role: payload.role };
    return next();
  } catch (err) {
    console.error(err); 
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
