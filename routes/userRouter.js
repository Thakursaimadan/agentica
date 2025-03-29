import express from 'express';
import authMiddleware from '../middleware/auth.js';
import Stripe from 'stripe';
import pool from '../db.js';
import dotenv from "dotenv";
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const userRouter = express.Router();

userRouter.use(authMiddleware)
//temporary route
userRouter.post('/register', async (req, res) => {
  try {
    //console.log("register route ",req.body);
    const { user_id, mess_id, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (user_id ,email, password, mess_id) VALUES ($1, $2, $3,$4)',
      [user_id, email, hashedPassword, mess_id]
    );
    res.json({ message: 'User registered successfully' });
  }
  catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Internal server error' });
  }

})
//temporary route
userRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ userId: user.user_id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  }
  catch (err) {
    console.log(err)
    res.status(500).json({ message: 'Internal server error' });
  }

});

//to get todays special item 
userRouter.get('/menu', authMiddleware, async (req, res) => {
  const result = await pool.query(
    `SELECT tsi.*, si.name, si.image_url, si.rating 
         FROM today_special_item tsi
         JOIN special_item si ON tsi.item_id = si.item_id`
  );
  res.json(result.rows);
})


//to get non redeemed orders
userRouter.get('/orders', async (req, res) => {
  try {
    console.log("print req.user ", req.user)
    const userId = req.user_id;
    const result = await pool.query(
      `SELECT * FROM orders WHERE user_id = $1 AND is_redeemed = false`,
      [userId]
    );
    console.log(result)
    res.json(result.rows);
  }
  catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Internal server error' });
  }

})

//to redirect the qr to link this route is there
userRouter.get('/orders/:orderId', async (req, res) => {

  try {
    const { orderId } = req.params;
    const orderRes = await pool.query(`SELECT * FROM orders WHERE order_id = $1`, [orderId]);
    if (orderRes.rowCount === 0) return res.status(404).json({ message: 'Order not found' });
    const itemsRes = await pool.query(
      `SELECT oi.item_id, si.name, oi.quantity
         FROM order_items oi
         JOIN special_items si ON oi.item_id = si.item_id
         WHERE oi.order_id = $1`,
      [orderId]
    );

    res.json({
      order: orderRes.rows[0],
      items: itemsRes.rows
    });
  }
  catch(err)
  {
    console.log(err);
    res.status(500).json({ message: 'Internal server error' });
  }
  
});

//route to submit mess change request
userRouter.post('/request-mess-change', async (req, res) => {
  const userId = req.user.user_id;
  const userRes = await pool.query(`SELECT mess_id FROM users WHERE user_id = $1`, [userId]);
  const currentMessId = userRes.rows[0].mess_id;
  let requestedMessId = 1;
  if (currentMessId === 1) {
    requestedMessId = 2;
  }
  await pool.query(
    `INSERT INTO mess_change_requests (user_id, requested_mess_id)
         VALUES ($1, $2)`,
    [userId, requestedMessId]
  );

  res.json({ message: `Mess change request submitted for Mess ${requestedMessId}` });
})

//to get redeemed orders to submit review
userRouter.get('/redeemed-orders', async (req, res) => {
  try{
    const userId = req.user_id;
    const orderRes = await pool.query(
      `SELECT o.order_id, o.created_at, oi.item_id, si.name, oi.quantity
           FROM orders o
           JOIN order_items oi ON o.order_id = oi.order_id
           JOIN special_items si ON si.item_id = oi.item_id
           WHERE o.user_id = $1 AND o.is_redeemed = true`,
      [userId]
    );
  
    res.json(orderRes.rows);
  }
  catch(err)
  {
    console.log(err);
    res.status(500).json({ message: 'Internal server error' });
  }
  
})
//to get the menu image
userRouter.get('/menu-image', async (req, res) => {

  res.json("https://www.google.com/url?sa=i&url=https%3A%2F%2Fwww.indiamart.com%2Fproddetail%2Fprinted-hotel-menu-card-27579549273.html&psig=AOvVaw2bxFFLNvknekZ46Z6_FPE7&ust=1742798041474000&source=images&cd=vfe&opi=89978449&ved=0CBQQjRxqFwoTCMCLkOPKn4wDFQAAAAAdAAAAABAI");
})

//to submit review
userRouter.post('/review', async (req, res) => {
  try{
    const userId = req.user_id;
  const { item_id, rating, content } = req.body;
  await pool.query(
    `INSERT INTO reviews (user_id, item_id, rating, content) VALUES ($1, $2, $3, $4)`,
    [userId, item_id, rating, content]
  );
  res.json({ message: 'Review submitted successfully' });
  }
  catch(err)
  {
    console.log(err);
    res.status(500).json({ message: 'Internal server error' });
  }
  
})

//to create order
userRouter.post('/create-order', async (req, res) => {
  try {
    const userId = req.user_id;
    const { items } = req.body;  //item.item_id,item.quantity
    console.log(items)
    if (!items || items.length === 0) return res.status(400).json({ message: 'No items to order' });

    const { rows: orderRows } = await pool.query(
      `INSERT INTO orders (user_id, created_at, payment_status, qr, is_redeemed) 
       VALUES ($1, NOW(), 'pending', '', false) RETURNING order_id`,
      [userId]
    );
    const orderId = orderRows[0].order_id;
    const qrLink = `http://localhost:${process.env.PORT}/orders/${orderId}`;

    await pool.query(
      `UPDATE orders SET qr = $1 WHERE order_id = $2`,
      [qrLink, orderId]
    );

    
    const orderItemsInsert = items.map(item =>
      pool.query(
        `INSERT INTO order_items (order_id, item_id, quantity) VALUES ($1, $2, $3)`,
        [orderId, item.item_id, item.quantity]
      )
    );
    await Promise.all(orderItemsInsert);

    res.json({ order_id: orderId });

  }
  catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Internal server error' });
  }

})

//checkout,payment
userRouter.post('/checkout', async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) return res.status(400).json({ message: 'Order ID is required' });
    
    const { rows: existingPayment } = await pool.query(
      `SELECT payment_status FROM orders WHERE order_id = $1`,
      [order_id]
    );

    if (existingPayment.length > 0 && existingPayment[0].payment_status === 'paid') {
      return res.json({ message: 'Order already paid' });
    }
    
    
    
    const { rows: orderItems } = await pool.query(
      `SELECT oi.item_id, oi.quantity, t.price 
         FROM order_items oi 
         JOIN today_special_items t ON oi.item_id = t.item_id 
         WHERE oi.order_id = $1`,
      [order_id]
    );
    if (orderItems.length === 0) {
      return res.status(404).json({ message: 'Order not found or has no items' });
    }
    const line_items = orderItems.map(item => ({
      price_data: {
        currency: 'inr',
        product_data: { name: `Item ${item.item_id}` },
        unit_amount: item.price * 100,
      },
      quantity: item.quantity,
    }));
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      client_reference_id: String(order_id),
      success_url: `http://localhost:${process.env.FRONT_PORT}/success`, //these urls are of frontend ok
      cancel_url: `http://localhost:${process.env.FRONT_PORT}/cancel`,
    })
    res.json({ sessionUrl: session.url });
  }
  catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
//to update payment status as paidre
userRouter.post('/payment-success', async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ message: 'Session ID is required' });
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ message: 'Payment not completed' });
    }
    const order_id = session.client_reference_id;

    await pool.query(`UPDATE orders SET payment_status = 'paid' WHERE order_id = $1`, [order_id]);

    res.json({ message: 'Payment successful' });
  }
  catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});



// userRouter.post('/process-mess-requests', async (req, res) => {
//   try {
//     // Step 1: Get all pending requests (oldest first)
//     const requests = await pool.query(
//       `SELECT request_id, user_id, requested_mess_id FROM mess_change_requests ORDER BY created_at ASC`
//     );

//     // Step 2: Count how many want to move A → B and B → A
//     let countAtoB = 0, countBtoA = 0;
//     const requestMap = {}; // To store request details

//     for (let req of requests.rows) {
//       requestMap[req.user_id] = req;
//       if (req.requested_mess_id === 2) countAtoB++;
//       else countBtoA++;
//     }

//     // Step 3: Get current mess capacities
//     const messStats = await pool.query(`SELECT mess_id, capacity, current_count FROM messes`);
//     let messA = messStats.rows.find(m => m.mess_id === 1);
//     let messB = messStats.rows.find(m => m.mess_id === 2);

//     let swaps = Math.min(countAtoB, countBtoA); // Maximum possible direct swaps

//     // Step 4: Process Swaps First
//     let processedUsers = new Set();
//     for (let req of requests.rows) {
//       if (swaps === 0) break; // No more swaps possible

//       const { request_id, user_id, requested_mess_id } = req;

//       // Find a user going in the opposite direction
//       const oppositeReq = requests.rows.find(r => 
//         r.requested_mess_id !== requested_mess_id && !processedUsers.has(r.user_id)
//       );

//       if (oppositeReq) {
//         // Swap users
//         await pool.query(`UPDATE users SET mess_id = $1 WHERE user_id = $2`, [requested_mess_id, user_id]);
//         await pool.query(`UPDATE users SET mess_id = $1 WHERE user_id = $2`, [oppositeReq.requested_mess_id, oppositeReq.user_id]);

//         // Remove processed requests
//         await pool.query(`DELETE FROM mess_change_requests WHERE request_id IN ($1, $2)`, [request_id, oppositeReq.request_id]);

//         processedUsers.add(user_id);
//         processedUsers.add(oppositeReq.user_id);

//         swaps--; // Reduce swap count
//       }
//     }

//     // Step 5: Process Remaining Requests (if capacity allows)
//     for (let req of requests.rows) {
//       if (processedUsers.has(req.user_id)) continue; // Skip already swapped users

//       const { request_id, user_id, requested_mess_id } = req;
//       let mess = (requested_mess_id === 1) ? messA : messB;

//       if (mess.current_count < mess.capacity) {
//         // Approve request
//         await pool.query(`UPDATE users SET mess_id = $1 WHERE user_id = $2`, [requested_mess_id, user_id]);

//         // Update mess counts
//         await pool.query(`UPDATE messes SET current_count = current_count + 1 WHERE mess_id = $1`, [requested_mess_id]);
//         await pool.query(`UPDATE messes SET current_count = current_count - 1 WHERE mess_id = (SELECT mess_id FROM users WHERE user_id = $1)`, [user_id]);

//         // Remove processed request
//         await pool.query(`DELETE FROM mess_change_requests WHERE request_id = $1`, [request_id]);

//         // Update mess stats
//         mess.current_count++;
//       }
//     }

//     res.json({ message: 'Mess change requests processed with swaps considered' });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// });

export default userRouter;