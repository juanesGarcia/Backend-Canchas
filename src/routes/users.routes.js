const { Router } = require("express");
const { 
getUsers,
register,
login 
}=require("../controllers/usersController")
const {
    registerValidator, 
    loginValidation,
    updateValidator} = require("../validators/users");
const { validationMiddleware } = require("../middlewares/validation-middleware"); 
const pool = require("../constants/db");
const router = Router();

router.get('/users',getUsers);
router.post('/register',registerValidator,validationMiddleware,register);
router.post('/login',loginValidation,validationMiddleware,login);
module.exports = router;