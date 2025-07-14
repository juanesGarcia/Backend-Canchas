const { Router } = require("express");
const { 
getUsers,
register,
login,
verifyToken,
updateUser,
deleteUser,
uploadImages,
getImages,
deleteImages
}=require("../controllers/usersController")
const {
    registerValidator, 
    loginValidation,
    updateValidator
    } = require("../validators/users");
const { validationMiddleware } = require("../middlewares/validation-middleware"); 
const authorizeRoles = require("../middlewares/auth-roles-middleware");
const {userAuth} = require("../middlewares/users-middleware");
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const router = Router();

router.get('/users',getUsers);
router.post('/register',registerValidator,validationMiddleware,register);
router.post('/login',loginValidation,validationMiddleware,login);
router.get(
    '/admin/dashboard',
    verifyToken, 
    authorizeRoles('superadmin'), 
    (req, res) => {
        res.status(200).json({ message: 'Bienvenido al panel de Superadmin!' });
    }
);
router.put('/user/:id',userAuth, updateValidator,validationMiddleware,updateUser);
router.delete('/user/:id',userAuth,deleteUser);
router.post('/upload/:id',upload.array('photo', 5),uploadImages);
router.get('/getimages/:id',getImages)
router.delete('/deleteimages/:id/:courtId', deleteImages);



module.exports = router;