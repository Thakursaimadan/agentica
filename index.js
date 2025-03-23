import express from 'express';
const app = express();
import dotenv from 'dotenv';
dotenv.config();
import cors from 'cors';
import userRouter from './routes/userRouter.js';


app.use(cors());
app.use(express.json());




app.use('users',userRouter)
//app.use('admin/',)



app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
})