const pool = require("../constants/db");
const {hash} = require('bcrypt');
const { verify , sign} = require("jsonwebtoken");
const{v4}=require("uuid");
const { SECRET } = require("../constants");

const getUsers =async(req, res) => {
    try {
     const result = await pool.query('select (id,name,email,password,role,phone) from users');
      res.json(result.rows)
    } catch (error) {
        console.log(error.message)
    }
}

const register =async(req, res) => {
    const {email,password,name,role,phone} = req.body;
    console.log(req.body)
    console.log(role)
    try {
        const id= v4()
        const hashedPassword = await hash(password,10)
        await pool.query('insert into users(id,name,email,password,role,phone) values ($1, $2,$3,$4,$5,$6) ',[ id,name,email,hashedPassword,role,phone])
        return res.status(201).json({
            success: true,
            message: "el registro fue exitoso",
        })
    } catch (error) {
        return res.status(500).json({
            error:error.message
        })
    }
   
}

const login= async (req,res)=>{
    let user = req.user
    console.log(user)
    let payload={
        id: user.id,
        email: user.email,
        name: user.name, 
        phone:user.phone,
        role:user.role
    }
    
    try {
        const token = sign(payload,SECRET,{expiresIn:'24h'})
        return res.status(200).cookie('token',token,{httpOnly:true}).json({
            success: true,
            message: "Entraste correctamente",
            info: payload,
            token: token,
        })
      
    } catch (error) {
        console.log(error.message)
        return res.status(500).json({
            error:error.message
        })
    }
}

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'Acceso no autorizado: Token no proporcionado.' });
    }

    const token = authHeader.split(' ')[1]; 

    if (!token) {
        return res.status(401).json({ error: 'Acceso no autorizado: Formato de token incorrecto.' });
    }

    try {
        const decoded = verify(token, process.env.SECRET);
        req.user = decoded; 
        console.log(decoded);
        next(); 

    } catch (error) {
        console.error('Error al verificar token:', error.message);
        return res.status(403).json({ error: 'Token inválido o expirado. Acceso denegado.' });
    }
};


const updateUser = async (req, res) => {
    const { id } = req.params;
    const { password, name } = req.body;
    const userId = req.user.id; // ID del usuario autenticado
    
    console.log(userId);
    console.log(name);
  
    try {
      if (userId !== id) {
        return res.status(401).json({ message: 'No tienes permiso para editar este perfil.' });
      }
      console.log(password)
      const hashedPassword = await hash(password,10)
  
      await pool.query('UPDATE users SET name = $1, password = $2 WHERE id = $3', [
        name,
        hashedPassword,
        id
      ]);  
      res.json({
        success: true,
        message: 'Perfil actualizado correctamente.'
      });
    } catch (error) {
      console.log(error.message);
      return res.status(500).json({
        error: error.message
      });
    }
  };
  
  const deleteUser = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id; // ID del usuario autenticado

    console.log(id)
  
    try {
      if (userId !== id) {
        return res.status(401).json({ message: 'No tienes permiso para eliminar este usuario.' });
      }
  
      const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
  
      if (result.rowCount === 0) {
        return res.status(404).json({
          message: 'Usuario no encontrado.'
        });
      }
  
      res.json({
        success: true,
        message: 'Usuario encontrado y eliminado.'
      });
    } catch (error) {
      console.log(error.message);
      return res.status(500).json({
        error: error.message
      });
    }
  };
  

module.exports ={
    getUsers,
    register,
    login,
    verifyToken,
    deleteUser,
    updateUser
}