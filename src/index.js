const express = require("express");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const passport = require("passport");
const cors = require("cors");

require("dotenv").config();
require("./middlewares/passport-middleware");
require("./middlewares/config")(passport);

const app = express();
const PORT = process.env.PORT || 3000;

// 🔥 CORS PRIMERO
const allowedOrigins = [
  "http://localhost:5173",
  "https://backend-canchas-production.up.railway.app"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options("*", cors());

// resto de middlewares
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());
app.use(morgan("dev"));

// rutas
const authRoutes = require("./routes/users.routes");
app.use(authRoutes);

// start
app.listen(PORT, () => {
  console.log(`🚀 Backend escuchando en puerto ${PORT}`);
});
