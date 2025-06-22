const pool = require("../constants/db");
const {hash} = require('bcryptjs');
const { sign } = require("jsonwebtoken");

const getUsers =async(req, res) => {
    try {
     const result = await pool.query('select (id,nombre,apellido) from usuarios');
      res.json(result.rows)
    } catch (error) {
        console.log(error.message)
    }
}

const register =async(req, res) => {
    const {email,password,name,rol,phone} = req.body;
    console.log(req.body)
    console.log(rol)
    try {
        const id= v4()
        const hashedPassword = await hash(password,10)
        await pool.query('insert into users(id,name,email,password,rol,phone) values ($1, $2,$3,$4,$5,$6) ',[ id,name,email,hashedPassword,rol,phone])
        return res.status(201).json({
            success: true,
            message: " the registracion was succefull",
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
        rol:user.rol,
        media_url:user.media_url,
    }
    
    try {
        const token = sign(payload,SECRET,{expiresIn:'24h'})
        return res.status(200).cookie('token',token,{httpOnly:true}).json({
            success: true,
            message: "Logged in succefully ",
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

module.exports ={
    getUsers,
    register,
    login
}