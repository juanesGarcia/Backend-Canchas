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

// 🔥 CORS PRIMERO, ANTES DE TODO
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// 🔥 responder preflight SIEMPRE
app.options("*", cors());

// luego middlewares
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
