const pool = require("../constants/db");
const { hash } = require("bcrypt");
const { verify, sign } = require("jsonwebtoken");
const { v4 } = require("uuid");
const { SECRET } = require("../constants");
const {
  uploadFiles,
  deleteFileByName,
  getFileNameFromUrl,
  deleteFileByNamepro,
} = require("../firebase");
const fs = require("fs/promises");
const path = require("path");

const getUsers = async (req, res) => {
  try {
    const result = await pool.query(
      "select (id,name,email,password,role,phone) from users"
    );
    res.json(result.rows);
  } catch (error) {
    console.log(error.message);
  }
};

const register = async (req, res) => {
  const { email, password, name, role, phone } = req.body;
  console.log(req.body);
  console.log(role);
  try {
    const id = v4();
    const hashedPassword = await hash(password, 10);
    await pool.query(
      "insert into users(id,name,email,password,role,phone) values ($1, $2,$3,$4,$5,$6) ",
      [id, name, email, hashedPassword, role, phone]
    );
    return res.status(201).json({
      success: true,
      message: "el registro fue exitoso",
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
};

const login = async (req, res) => {
  let user = req.user;
  console.log(user);
  let payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
  };

  try {
    const token = sign(payload, SECRET, { expiresIn: "24h" });
    return res.status(200).cookie("token", token, { httpOnly: true }).json({
      success: true,
      message: "Entraste correctamente",
      info: payload,
      token: token,
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({
      error: error.message,
    });
  }
};

const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res
      .status(401)
      .json({ error: "Acceso no autorizado: Token no proporcionado." });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ error: "Acceso no autorizado: Formato de token incorrecto." });
  }

  try {
    const decoded = verify(token, process.env.SECRET);
    req.user = decoded;
    console.log(decoded);
    next();
  } catch (error) {
    console.error("Error al verificar token:", error.message);
    return res
      .status(403)
      .json({ error: "Token inválido o expirado. Acceso denegado." });
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
      return res
        .status(401)
        .json({ message: "No tienes permiso para editar este perfil." });
    }
    console.log(password);
    const hashedPassword = await hash(password, 10);

    await pool.query(
      "UPDATE users SET name = $1, password = $2 WHERE id = $3",
      [name, hashedPassword, id]
    );
    res.json({
      success: true,
      message: "Perfil actualizado correctamente.",
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({
      error: error.message,
    });
  }
};

const deleteUser = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id; // ID del usuario autenticado

  console.log(id);

  try {
    if (userId !== id) {
      return res
        .status(401)
        .json({ message: "No tienes permiso para eliminar este usuario." });
    }

    const result = await pool.query("DELETE FROM users WHERE id = $1", [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Usuario no encontrado.",
      });
    }

    res.json({
      success: true,
      message: "Usuario encontrado y eliminado.",
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({
      error: error.message,
    });
  }
};

const uploadImages = async (req, res) => {
  const { id } = req.params;
  const { description } = req.body;

  if (!req.files || req.files.length === 0) {
    console.error("Error: No se subieron archivos para la cancha.");
    return res.status(400).json({
      error: "Debe subir al menos una imagen para la cancha.",
    });
  }
  try {
    const getCourtResult = await pool.query(
      "SELECT id from courts where user_id=$1",
      [id]
    );
    console.log(getCourtResult);
    let courtId = getCourtResult.rows[0].id;
    console.log(courtId);
    const courtResult = await pool.query(
      "UPDATE courts SET description = $1, updated_at = NOW() WHERE id = $2  RETURNING id,name",
      [description, courtId]
    );

    const photoInsertPromises = req.files.map(async (file) => {
      try {
        const result = await uploadFiles(file);
        const insertPhotoResult = await pool.query(
          "INSERT INTO photos (court_id, url) VALUES ($1, $2) RETURNING id, url",
          [courtId, result.url]
        );
        return { success: true, data: insertPhotoResult.rows[0] }; // Retorna éxito y datos
      } catch (photoError) {
        console.error(
          `Error al insertar la foto para courtId ${courtId}, originalname ${file.originalname}:`,
          photoError
        );
        return {
          success: false,
          error: photoError.message,
          originalname: file.originalname,
        }; // Retorna fallo y error
      }
    });
const photoInsertResults = await Promise.all(photoInsertPromises);
console.log(
  "Todas las inserciones de fotos terminadas. Resultados:",
  photoInsertResults
);

await Promise.all(
  req.files.map(async (file) => {
    const MAX_RETRIES = 5; // Número máximo de reintentos
    const RETRY_DELAY_MS = 200; // Retraso base entre reintentos
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        if (file.path) {
          // Añadir un retraso antes de cada intento de eliminación (inicial + creciente)
          await new Promise((resolve) => setTimeout(resolve, 100 + i * RETRY_DELAY_MS));
          await fs.unlink(file.path); // Usa fs.promises.unlink para borrar asíncronamente
          console.log(`Archivo temporal eliminado: ${file.path}`);
          break; // Salir del bucle si la eliminación fue exitosa
        }
      } catch (unlinkError) {
        if (unlinkError.code === "EPERM") {
          console.warn(
            `Intento ${i + 1}/${MAX_RETRIES}: No se pudo eliminar el archivo temporal '${file.path}' (EPERM), reintentando...`,
            unlinkError.message
          );
          if (i === MAX_RETRIES - 1) { // Si es el último intento y sigue fallando
            console.error(`Falló la eliminación del archivo temporal '${file.path}' después de ${MAX_RETRIES} intentos:`, unlinkError.message);
          }
        } else if (unlinkError.code !== "ENOENT") { // 'ENOENT' significa que el archivo no existe (no es un error real aquí)
          console.warn(
            `No se pudo eliminar el archivo temporal '${file.path}':`,
            unlinkError.message
          );
        }
        // Si no es un error EPERM, o si ya se agotaron los reintentos EPERM, no reintentar
        if (unlinkError.code !== "EPERM" || i === MAX_RETRIES - 1) {
          break;
        }
      }
    }
  })
);

const failedPhotoOperations = photoInsertResults.filter((r) => !r.success);
if (failedPhotoOperations.length > 0) {
  console.error(
    "Algunas operaciones de fotos (subida/inserción en DB) fallaron:",
    failedPhotoOperations
  );
}


    const courtWithPhotosResult = await pool.query(
      `SELECT
                c.id AS court_id,
                c.user_id,
                p.id,
                p.url
            FROM
                courts c
            LEFT JOIN
                photos p ON c.id = p.court_id
            WHERE
                c.id = $1`,
      [courtId]
    );

    const courtData = courtWithPhotosResult.rows[0];

    res.json({
      message: "Cancha y fotos insertadas correctamente.",
      court: courtData,
    });
  } catch (error) {
    console.error("Error al subir las fotos y crear la cancha:", error);
    res.status(500).json({
      error: error.message,
    });
  }
};

const getImages = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "SELECT id, title, user_id, created_at, media_urls FROM courts WHERE user_id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        message: "El usuario no tiene canchas ni imágenes asociadas.",
        info: {
          user_id: id,
          courts: [],
        },
      });
    }

    const userData = {
      user_id: result.rows[0].user_id,
      courts: result.rows.map((row) => ({
        court_id: row.id,
        title: row.title,
        created_at: row.created_at,
        photos: row.media_urls
          ? row.media_urls.map((url) => ({ media_url: url }))
          : [],
      })),
    };

    res.json({
      success: true,
      message: "Información de usuario y canchas recuperada correctamente.",
      info: userData,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      success: false,
      message: "Error al recuperar la información del usuario y las canchas.",
    });
  }
};

const deleteImages = async (req, res) => {
  const { courtId } = req.params;
  console.log(courtId);

  try {
    const courtToDelete = await pool.query(
      "SELECT media_urls FROM courts WHERE id = $1",
      [courtId]
    );

    if (courtToDelete.rows.length === 0) {
      return res.status(404).json({
        message: "Cancha no encontrada.",
      });
    }

    const mediaUrlsToDelete = courtToDelete.rows[0].media_urls || [];

    await pool.query("DELETE FROM courts WHERE id = $1", [courtId]);

    await Promise.all(
      mediaUrlsToDelete.map(async (url) => {
        const fileName = url.substring(url.lastIndexOf("/") + 1);
        if (fileName) {
          await deleteFileByName(fileName);
        }
      })
    );

    res.json({
      message: "Cancha y fotos asociadas eliminadas correctamente.",
    });
  } catch (error) {
    console.error("Error al eliminar la cancha y las fotos:", error);
    res.status(500).json({
      error: error.message,
    });
  }
};

module.exports = {
  getUsers,
  register,
  login,
  verifyToken,
  deleteUser,
  updateUser,
  uploadImages,
  getImages,
  deleteImages,
};
