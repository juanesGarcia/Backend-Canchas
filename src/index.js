const express = require('express');
const morgan = require('morgan');
const pool = require('./constants/db');
const app = express();
const cors = require('cors')
const PORT = 3000;
app.use(morgan('dev'))
//initialize middlewares
app.use(express.json());
app.use(cors({
    origin: true,
    credentials: true
  }));

const authRoutes=require('./routes/users.routes');

app.use(authRoutes);

const appStart =()=>{
  try {
      app.listen(PORT,()=>{
          console.log(`listener: ${PORT}`);
      })
      
  } catch (error) {
      console.log(`Error:${error.message}`);
  }
}

appStart()