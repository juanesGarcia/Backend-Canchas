const { check } = require("express-validator");
const db = require("../constants/db");
const { compare } = require("bcryptjs");



const password= check('password')
  .isLength({ min: 6 ,max:15})
  .withMessage('La contraseña debe tener al menos 6 caracteres')
  .matches(/^(?=.*[a-z])(?=.*\d)[a-zA-Z\d]+$/)
  .withMessage(
  'La contraseña debe contener al menos una letra minúscula y un número'
  );

  const name= check('name')
  .isLength({ min: 3 ,max:20})
  .withMessage('el nombre debe tener al menos 3 caracteres y maximo 20')
  .matches(/^[^\s]+$/, 'i')
  .withMessage('El nombre no debe contener espacios en blanco.');

  const email = check('email')
  .isEmail()
  .withMessage('VALID EMAIL')
  .matches(/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/)
  .withMessage('Debe proporcionar un correo electrónico válido');

const emailExist = check('email').custom(async(value)=>{
    const {rows} = await db.query('select * from users where email = $1',[
        value,
    ])

 if(rows.length){
    throw new Error("Email Already Exist")
 }
})

const loginCheck = check('email').custom(async(value, {req})=>{
  const user = await db.query('select * from users where email = $1',[value])
  if(!user.rows.length){
    throw new Error("Email doesn't exist")
  }
  const validPassword= await compare(req.body.password,user.rows[0].password)

  if(!validPassword){
    throw new Error("Incorrect password")
  }
  req.user = user.rows[0]
})

const nameExist = check('name').custom(async(value)=>{
  const {rows} = await db.query('select * from users where name = $1',[
      value,
  ])

if(rows.length){
  throw new Error("name Already Exist")
}
})

module.exports={
  registerValidator: [password,email,emailExist,name,nameExist],
  loginValidation:[loginCheck],
  updateValidator:[password,name,nameExist]
}

