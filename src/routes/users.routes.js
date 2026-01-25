const { Router } = require("express");
const { 
logout,
getUsers,
register,
login,
verifyToken,
updateUser,
deleteUser,
uploadImages,
getImages,
deleteImages,
getPosts,          
getPostById,    
updatePost,
deletePost,
createPost,
getCourts,
getCourtById,
updateCourt,
deleteCourt,
deleteSubcourt,
getServices,
createReservation,
registerServices,
getSubCourts,
getReservationsBySubcourt,
createSubcourt,
getSubCourtPrice,
updateSubCourtAndPrices,
getUserCourtsReservations,
getUserReservationsByDate,
registerProveedor,
registerPromotions,
getReservationActive,
getPromotionsByUser,
uploadImagesServices,
getReservationsByDay,
getReservationsByHour,
getPeakOffPeakHours,
getPeriodicReservations,
getFrequentClients,
getRevenueByPaymentMethod,
deleteReservation,
getSubcourtPriceByDate,
updateReservation,
sendReservationReminder,
getSubCourtsName,
updateTransferWithPrice
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
router.post('/register',registerValidator,register);
router.post('/registerProveedor',registerValidator,registerProveedor);
router.post('/registerPromotions/:userId',registerPromotions);
router.post('/registerServices/:userId',registerServices);
router.post('/login',loginValidation,validationMiddleware,login);
router.get(
    '/admin/dashboard',
    verifyToken, 
    authorizeRoles('superadmin'), 
    (req, res) => {
        res.status(200).json({ message: 'Bienvenido al panel de Superadmin!' });
    }
);
router.get('/logout',logout);
router.put('/user/:id', updateValidator,updateUser);
router.delete('/user/:id',userAuth,deleteUser);
router.post('/upload/:id',upload.array('photo', 5),uploadImages);
router.post('/uploadServices/:id',upload.array('photo', 5),uploadImagesServices);
router.get('/getimages/:id',getImages)
router.delete('/deleteimages/:id/:courtId', deleteImages);
router.post('/posts', verifyToken, upload.array('images', 5), createPost); 
router.get('/posts', getPosts); 
router.get('/posts/:id', getPostById); 
router.put('/posts/:id', verifyToken, upload.array('images', 5), updatePost); 
router.delete('/posts/:id', verifyToken, deletePost); 
router.get('/courts', getCourts);
router.get('/services', getServices);
router.get('/courts/:id',getCourtById);
router.get('/subCourts/:id', getSubCourts);
router.get('/subCourtName/:id', getSubCourtsName);
router.get('/getReservations/:subcourtId', getReservationsBySubcourt);
router.put("/reservations/:id/pay-all", updateTransferWithPrice);
router.put('/courts/:id', userAuth, updateCourt);
router.delete('/courts/:id', userAuth, deleteCourt);
router.post('/deleteReservations/:id', deleteReservation);
router.delete('/subcourts/:subcourtId', deleteSubcourt);
router.post('/reservations/:subcourtId', createReservation);
router.put('/reservations/:subcourtId', updateReservation);
router.get('/subcourtPrice/:subcourtId', getSubCourtPrice);
router.post('/subcourt/:id', createSubcourt);
router.put('/subcourtPrice/:subcourtId', updateSubCourtAndPrices);
router.get('/Reservation/:id',getUserCourtsReservations);
router.get('/ReservationDate/:id',getUserReservationsByDate);
router.get('/userCourts/:Id',getReservationActive);
router.get('/getPromotions/:id',getPromotionsByUser);
const biMiddleware = [verifyToken, authorizeRoles('admin')];
router.get('/analytics/reservationsDays/:id', getReservationsByDay);
router.get('/analytics/reservationsHours/:id', getReservationsByHour);
router.get('/analytics/HotCold/:id', getPeakOffPeakHours);
router.get('/analytics/periodicReservations/:id', getPeriodicReservations);
router.get('/analytics/frequentClients/:id',getFrequentClients);
router.get('/analytics/revenuePayment/:id', getRevenueByPaymentMethod);
router.get('/:id/price', getSubcourtPriceByDate);
router.post("/reservations/:reservationId/reminder", sendReservationReminder);

module.exports = router;
