const { Router } = require("express");
const { getUsers }=require("../controllers/usersController")
const pool = require("../constants/db");
const router = Router();

router.get('/user',getUsers);

module.exports = router;