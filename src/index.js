const express = require('express');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const app = express();
const cors = require('cors')
require('./middlewares/passport-middleware')
require('./middlewares/config')(passport);
const PORT = process.env.PORT || 3000
app.use(cookieParser());
app.use(passport.initialize())
app.use(morgan('dev'))
//initialize middlewares
app.use(express.json());
app.use(cors({
    origin: 'https://canchas-colombia.vercel.app',
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