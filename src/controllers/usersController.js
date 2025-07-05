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
const fs = require("fs").promises;
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
  const {
    email,
    password,
    name,
    role,
    phone,
    courtName,
    courtAddress,
    courtCity,
    courtPhone,
    courtType,
    is_public,
    description,
    state,
    subcourts
  } = req.body;

  console.log(req.body);
  console.log(role);

  try {
    const id = v4();
    const hashedPassword = await hash(password, 10);
    await pool.query(
      "insert into users(id,name,email,password,role,phone) values ($1, $2,$3,$4,$5,$6) ",
      [id, name, email, hashedPassword, role, phone]
    );

    const courtId = v4();
    const now = new Date();
    await pool.query(
      "insert into courts(id, name, address, city, phone, courttype, is_public, description, create_at, update_at, sata) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
      [courtId, courtName, courtAddress, courtCity, courtPhone, courtType, is_public, description, now, now, state]
    );

    if (subcourts && Array.isArray(subcourts) && subcourts.length > 0) {
      for (const subcourt of subcourts) {
        const subcourtId = v4();
        const { subcourtName, state: subcourtState } = subcourt; // Destructure subcourtName and subcourtState

        await pool.query(
          "insert into subcourts(id, court_id, name, create_at, update_at, state) values ($1, $2, $3, $4, $5, $6)",
          [subcourtId, courtId, subcourtName, now, now, subcourtState]
        );
      }
    }

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
    return res.status(400).json({
      error: "Debe subir al menos una imagen para la cancha.",
    });
  }

  const filesToCleanup = req.files.map(file => file.path).filter(Boolean);

  try {
    const getCourtResult = await pool.query(
      "SELECT id from courts where user_id=$1",
      [id]
    );

    if (getCourtResult.rows.length === 0) {
      return res.status(404).json({
        error: "Cancha no encontrada para el usuario proporcionado.",
      });
    }

    let courtId = getCourtResult.rows[0].id;

    const courtResult = await pool.query(
      "UPDATE courts SET description = $1, updated_at = NOW() WHERE id = $2 RETURNING id,name",
      [description, courtId]
    );

    const photoInsertPromises = req.files.map(async (file) => {
      try {
        const result = await uploadFiles(file);
        const insertPhotoResult = await pool.query(
          "INSERT INTO photos (court_id, url) VALUES ($1, $2) RETURNING id, url",
          [courtId, result.url]
        );
        return { success: true, data: insertPhotoResult.rows[0], filePath: file.path };
      } catch (photoError) {
        return {
          success: false,
          error: photoError.message,
          originalname: file.originalname,
          filePath: file.path
        };
      }
    });

    const photoInsertResults = await Promise.all(photoInsertPromises);

    const cleanupPromises = filesToCleanup.map(async (filePath) => {
      if (!filePath) return;

      const MAX_RETRIES = 15;
      const RETRY_DELAY_MS = 300;

      for (let i = 0; i < MAX_RETRIES; i++) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 150 + i * RETRY_DELAY_MS));
          await fs.unlink(filePath);
          return { success: true, filePath: filePath };
        } catch (unlinkError) {
          if (unlinkError.code === "EPERM") {
            if (i === MAX_RETRIES - 1) {
              return { success: false, filePath: filePath, error: unlinkError.message };
            }
          } else if (unlinkError.code === "ENOENT") {
            return { success: true, filePath: filePath };
          } else {
            return { success: false, filePath: filePath, error: unlinkError.message };
          }
        }
      }
    });

    await Promise.all(cleanupPromises);

    const failedPhotoOperations = photoInsertResults.filter((r) => !r.success);
    if (failedPhotoOperations.length > 0) {
      return res.status(500).json({
        message: "Se procesaron las imágenes, pero algunas operaciones fallaron.",
        details: failedPhotoOperations,
      });
    }

    res.status(200).json({
      message: "Imágenes subidas y descripción actualizada exitosamente.",
      court: courtResult.rows[0],
      uploadedPhotos: photoInsertResults.map(r => r.data),
    });

  } catch (error) {
    const cleanupOnFailPromises = filesToCleanup.map(async (filePath) => {
      if (!filePath) return;
      try {
        await fs.unlink(filePath);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") {
          
        }
      }
    });
    await Promise.all(cleanupOnFailPromises);

    res.status(500).json({
      error: "Error interno del servidor al procesar las imágenes.",
      details: error.message,
    });
  }
};

const getImages = async (req, res) => {
  const { id } = req.params;

  try {
    const courtsResult = await pool.query(
      "SELECT id, name, user_id, created_at FROM courts WHERE user_id = $1",
      [id]
    );

    if (courtsResult.rows.length === 0) {
      return res.json({
        success: true,
        message: "El usuario no tiene canchas ni imágenes asociadas.",
        info: {
          user_id: id,
          courts: [],
        },
      });
    }

    const courtsWithPhotos = await Promise.all(
      courtsResult.rows.map(async (courtRow) => {
        const photosResult = await pool.query(
          "SELECT url FROM photos WHERE court_id = $1",
          [courtRow.id]
        );

        const photos = photosResult.rows.map((photoRow) => ({
          url: photoRow.url,
        }));

        return {
          court_id: courtRow.id,
          description: courtRow.name,
          created_at: courtRow.created_at,
          photos: photos,
        };
      })
    );

    const userData = {
      user_id: courtsResult.rows[0].user_id,
      courts: courtsWithPhotos,
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
  const { id, courtId } = req.params;

  const photoIdToUse = id ? String(id).replace(/\s/g, '').trim() : null;
  const courtIdToUse = courtId ? String(courtId).replace(/\s/g, '').trim() : null;
  console.log(photoIdToUse);
  console.log(courtIdToUse);
  try {
    if (!photoIdToUse || !courtIdToUse) {
      return res.status(400).json({
        success: false,
        message: "Faltan los IDs de la imagen o la cancha en la solicitud.",
      });
    }

    const deleteDbResult = await pool.query(
      "DELETE FROM photos WHERE id= $1 AND court_id= $2 RETURNING id",
      [photoIdToUse, courtIdToUse]
    );

    if (deleteDbResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "La imagen no fue encontrada o no pertenece a la cancha especificada.",
      });
    }

    res.json({
      success: true,
      message: "Imagen eliminada correctamente.",
      deleted_image_id: photoIdToUse,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      success: false,
      message: "Error al eliminar la imagen.",
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
  deleteImages
};
