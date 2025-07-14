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
deleteImages,
createPost,
getPosts,       
getPostById,    
updatePost,
deletePost,
createPost,
getPosts,
getPostById,    
updatePost,     
deletePost,
getCourts,
getCourtById,
updateCourt,
deleteCourt,
deleteSubcourt
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
router.post('/posts', verifyToken, upload.array('images', 5), createPost); 
router.get('/posts', getPosts); 
router.get('/posts/:id', getPostById); 
router.put('/posts/:id', verifyToken, upload.array('images', 5), updatePost); 
router.delete('/posts/:id', verifyToken, deletePost); 
router.get('/courts', getCourts);
router.get('/courts/:id', getCourtById);
router.put('/courts/:id', userAuth, upload.array('newPhotos', 5), updateCourt);
router.delete('/courts/:id', userAuth, deleteCourt);
router.delete('/subcourts/:subcourtId', userAuth, deleteSubcourt);


module.exports = router;