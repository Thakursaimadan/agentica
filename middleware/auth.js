import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET;

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.user_id=decoded.userId;
    //console.log("printing req.user ",decoded);
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

export default authMiddleware;