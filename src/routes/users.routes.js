const { Router } = require("express");
const { getUsers }=require("../controllers/usersController")
const pool = require("../constants/db");
const router = Router();

router.get('/users',getUsers);

module.exports = router;