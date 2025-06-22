const pool = require("../constants/db");

const getUsers =async(req, res) => {
    try {
     const result = await pool.query('select (id,nombre,apellido) from usuarios');
      res.json(result.rows)
    } catch (error) {
        console.log(error.message)
    }
   
}
module.exports ={
    getUsers
}