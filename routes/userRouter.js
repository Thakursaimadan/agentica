import express from 'express';
import authMiddleware from '../middleware/auth.js';
import Stripe from 'stripe';
import pool from '../db.js';
import dotenv from "dotenv";
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const userRouter = express.Router();

userRouter.use(authMiddleware)
//temporary route
userRouter.post('/register',async (req,res)=>{  
    const {mess_id,email,password}=req.body;
    const hashedPassword=await bcrypt.hash(password,10);
    await pool.query(
        'INSERT INTO users (email, password, mess_id) VALUES ($1, $2, $3)',
        [email, hashedPassword, mess_id]
      );
      res.json({ message: 'User registered successfully' });
})
//temporary route
userRouter.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
  
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });
  
    const token = jwt.sign({ userId: user.user_id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  });

//to get todays special item 
userRouter.get('/menu',async (req,res)=>{
    const result = await pool.query(
        `SELECT tsi.*, si.name, si.image_url, si.rating 
         FROM today_special_item tsi
         JOIN special_item si ON tsi.item_id = si.item_id`
      );
      res.json(result.rows);
})

//checkout,payment
userRouter.post('/checkout', async (req, res) => {
    
    res.send('payment done');
  });

//to get non redeemed orders
userRouter.get('/orders',async (req,res)=>{
    const userId = req.user.user_id;
    const result = await pool.query(
      `SELECT * FROM orders WHERE user_id = $1 AND is_redeemed = false`,
      [userId]
    );
    res.json(result.rows);
})

//to redirect the qr to link this route is there
userRouter.get('/orders/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const orderRes = await pool.query(`SELECT * FROM orders WHERE order_id = $1`, [orderId]);
    if (orderRes.rowCount === 0) return res.status(404).json({ message: 'Order not found' });
    const itemsRes = await pool.query(
        `SELECT oi.item_id, si.name, oi.quantity, oi.price 
         FROM order_items oi
         JOIN special_item si ON oi.item_id = si.item_id
         WHERE oi.order_id = $1`,
        [orderId]
      );
    
      res.json({
        order: orderRes.rows[0],
        items: itemsRes.rows
      });
  });

//route to submit mess change request
userRouter.post('/request-mess-change',async (req,res)=>{
    const userId = req.user.user_id;
    const userRes = await pool.query(`SELECT mess_id FROM users WHERE user_id = $1`, [userId]);
    const currentMessId = userRes.rows[0].mess_id;
    let requestedMessId = 1;
    if(currentMessId===1)
    {
        requestedMessId=2;
    }
    await pool.query(
        `INSERT INTO mess_change_requests (user_id, requested_mess_id)
         VALUES ($1, $2)`,
        [userId, requestedMessId]
      );
    
      res.json({ message: `Mess change request submitted for Mess ${requestedMessId}` });
})

//to get redeemed orders to submit review
userRouter.get('/redeemed-orders',async (req,res)=>{
    const userId = req.user.user_id;
    const orderRes = await pool.query(
        `SELECT o.order_id, o.order_time, oi.item_id, si.name, oi.quantity
         FROM orders o
         JOIN order_items oi ON o.order_id = oi.order_id
         JOIN special_item si ON si.item_id = oi.item_id
         WHERE o.user_id = $1 AND o.is_redeemed = true
         ORDER BY o.order_time DESC`,
        [userId]
      );
    
      res.json(orderRes.rows);
})
//to get the menu image
userRouter.get('/menu-image',async (req,res)=>{
    
    res.json("https://www.google.com/url?sa=i&url=https%3A%2F%2Fwww.indiamart.com%2Fproddetail%2Fprinted-hotel-menu-card-27579549273.html&psig=AOvVaw2bxFFLNvknekZ46Z6_FPE7&ust=1742798041474000&source=images&cd=vfe&opi=89978449&ved=0CBQQjRxqFwoTCMCLkOPKn4wDFQAAAAAdAAAAABAI");
})

//to submit review
userRouter.post('/review',async(req,res)=>{  
    const userId = req.user.user_id;
    const { item_id, rating, comment } = req.body;
    await pool.query(
        `INSERT INTO reviews (user_id, order_id, rating, review) VALUES ($1, $2, $3, $4)`,
        [userId, item_id, rating, comment]
      );
      res.json({ message: 'Review submitted successfully' });
})


export default userRouter;