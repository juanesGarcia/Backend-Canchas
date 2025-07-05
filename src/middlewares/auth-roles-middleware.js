

const authorizeRoles = (requiredRole) => { 
    return (req, res, next) => {
        if (!req.user || !req.user.role) {

            return res.status(401).json({ error: 'Acceso denegado. Usuario no autenticado o rol no encontrado.' });
        }
        if (req.user.role === requiredRole) {
            next(); 
        } else {
            return res.status(403).json({ error: 'Acceso denegado. Permisos insuficientes.' });
        }
    };
};

module.exports = authorizeRoles;