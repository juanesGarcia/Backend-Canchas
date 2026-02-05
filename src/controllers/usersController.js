const pool = require("../constants/db");
const { hash } = require("bcrypt");
const { verify, sign } = require("jsonwebtoken");
const { v4 } = require("uuid");
const { SECRET } = require("../constants");
const { validationResult } = require("express-validator");
const { uploadFiles, deleteFileByName } = require("../firebase");
const fs = require("fs").promises;
const path = require("path");
const { Console } = require("console");
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

const client = require("twilio")(accountSid, authToken);

const getUsers = async (req, res) => {
  try {
    const result = await pool.query(
      "select (id,name,email,password,role,phone) from users",
    );
    res.json(result.rows);
  } catch (error) {
    console.log(error.message);
  }
};

// Asegúrate de que esta ruta sea correcta

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
    court_type,
    price,
    is_public,
    description,
    state,
    subcourts,
  } = req.body;

  console.log(req.body);
  console.log(court_type);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const user_id = v4();
    const hashedPassword = await hash(password, 10);

    await client.query(
      "insert into users(id,name,email,password,role,phone,state) values ($1, $2,$3,$4,$5,$6,$7) ",
      [user_id, name, email, hashedPassword, role, phone, state],
    );

    const courtId = v4();
    const now = new Date();

    await client.query(
      "insert into courts(id, name, address, city, phone, court_type, is_public, description, created_at, updated_at, state, user_id,price) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
      [
        courtId,
        courtName,
        courtAddress,
        courtCity,
        courtPhone,
        court_type,
        is_public,
        description,
        now,
        now,
        state,
        user_id,
        price,
      ],
    );

    // ✅ NUEVO: Lógica para insertar los precios por día de la semana

    if (subcourts && Array.isArray(subcourts) && subcourts.length > 0) {
      for (const subcourt of subcourts) {
        const subcourtId = v4();
        const { subcourtName, state: subcourtState } = subcourt;

        await client.query(
          "insert into subcourts(id, court_id, name, created_at, updated_at, state) values ($1, $2, $3, $4, $5, $6)",
          [subcourtId, courtId, subcourtName, now, now, subcourtState],
        );

        const daysOfWeek = [
          "lunes",
          "martes",
          "miercoles",
          "jueves",
          "viernes",
          "sábado",
          "domingo",
        ];

        for (const day of daysOfWeek) {
          const IdCourtPrice = v4();
          await client.query(
            "INSERT INTO subcourt_prices (subcourt_price_id, subcourt_id,day_of_week,price,updated_at ) VALUES ($1, $2, $3, $4, $5)",
            [IdCourtPrice, subcourtId, day, price, now],
          );
        }
      }
    }

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "El registro fue exitoso y todos los datos fueron guardados.",
      user: user_id,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(
      "Error x`en el registro (transacción revertida):",
      error.message,
    );
    return res.status(500).json({
      error: error.message,
      message:
        "No se pudo completar el registro debido a un error. Ningún dato fue guardado.",
    });
  } finally {
    client.release();
  }
};

const registerServices = async (req, res) => {
  const {
    courtName,
    courtAddress,
    courtCity,
    courtPhone,
    price,
    description,
    state,
    court_type,
    is_public,
    is_court,
    type,
  } = req.body;

  const { userId } = req.params;

  console.log(req.body);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const serviceId = v4();
    const now = new Date(); // Insertar solo en la tabla 'courts'
    await client.query(
      "insert into courts(id, name, address, city, phone, price, description, created_at, updated_at, state, user_id,is_court,type,court_type) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,$13,$14)",
      [
        serviceId,
        courtName,
        courtAddress,
        courtCity,
        courtPhone,
        price,
        description,
        now,
        now,
        state,
        userId,
        is_court,
        court_type,
        type,
      ],
    );
    console.log("user" + userId);

    await client.query("COMMIT");
    return res.status(201).json({
      success: true,
      message: "El registro fue exitoso y todos los datos fueron guardados.",
      user: userId,
      promotionId: serviceId,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(
      "Error en el registro del servicio (transacción revertida):",
      error.message,
    );
    throw new Error("No se pudo completar el registro del servicio.");
  } finally {
    client.release();
  }
};

const registerPromotions = async (req, res) => {
  const { name, phone, price, description, state, type } = req.body;

  const { userId } = req.params;

  console.log(req.body);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Validar que la cancha exista y pertenezca al usuario
    const courtQueryResult = await client.query(
      "SELECT address, city FROM courts WHERE user_id = $1 AND type = 'court'",
      [userId],
    );

    console.log(courtQueryResult);

    if (courtQueryResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "La cancha asociada no existe o no pertenece a este usuario.",
      });
    }

    const { address, city } = courtQueryResult.rows[0];

    // 2. Insertar la nueva promoción usando los datos de la cancha
    const promotionId = v4();
    const now = new Date();

    await client.query(
      "insert into courts(id, name, address, city, phone, price, description, created_at, updated_at, state, user_id, is_court, type) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
      [
        promotionId,
        name,
        address,
        city,
        phone,
        price,
        description,
        now,
        now,
        state,
        userId,
        false,
        type,
      ],
    );

    await client.query("COMMIT");
    return res.status(201).json({
      success: true,
      message: "El registro fue exitoso y todos los datos fueron guardados.",
      user: userId,
      promotionId,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(
      "Error en el registro de la promoción (transacción revertida):",
      error.message,
    );
    return res.status(500).json({
      success: false,
      error: "No se pudo completar el registro de la promoción.",
    });
  } finally {
    client.release();
  }
};

const login = async (req, res) => {
  let user = req.user;

  if (!user.state) {
    return res.status(403).json({
      success: false,
      message: "Usuario inactivo. Contacta al administrador.",
    });
  }

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
    return res.status(500).json({ error: error.message });
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

// En tu backend (Node.js)
const updateUser = async (req, res) => {
  const { id } = req.params;
  const { password, name, email } = req.body;

  console.log("Datos recibidos:", req.body);

  try {
    const hashedPassword = await hash(password, 10);

    await pool.query(
      `UPDATE users 
           SET name = $1, email = $2, password = $3 
           WHERE id = $4`,
      [name, email, hashedPassword, id],
    );

    res.json({
      success: true,
      message: "Perfil actualizado correctamente.",
    });
  } catch (error) {
    console.error("Error al actualizar usuario:", error.message);
    return res.status(500).json({
      error: "Error interno al actualizar el perfil.",
      details: error.message,
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

const logout = async (req, res) => {
  try {
    return res.status(200).clearCookie("token", { httpOnly: true }).json({
      success: true,
      message: "Logged out succefully ",
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

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      error: "Debe subir al menos una imagen para la cancha.",
    });
  }

  const filesToCleanup = req.files.map((file) => file.path).filter(Boolean);

  try {
    const getCourtResult = await pool.query(
      "SELECT id from courts where user_id=$1",
      [id],
    );

    if (getCourtResult.rows.length === 0) {
      return res.status(404).json({
        error: "Cancha no encontrada para el usuario proporcionado.",
      });
    }

    const court_Id = getCourtResult.rows[0].id;

    // --- NUEVO BLOQUE: eliminar fotos actuales ---
    const existingPhotosResult = await pool.query(
      "SELECT id, url FROM photos WHERE court_id = $1",
      [court_Id],
    );

    const existingPhotos = existingPhotosResult.rows;

    // Eliminar las fotos de Firebase (o almacenamiento)
    for (const photo of existingPhotos) {
      try {
        await deleteFileByName(photo.url); // función que elimina la imagen por url/ruta
      } catch (firebaseError) {
        console.error(
          "Error eliminando imagen previa en Firebase:",
          firebaseError,
        );
      }
    }

    // Eliminar las fotos de la base de datos
    await pool.query("DELETE FROM photos WHERE court_id = $1", [court_Id]);
    // --- FIN BLOQUE ELIMINACIÓN ---

    // Subir nuevas imágenes
    const photoInsertPromises = req.files.map(async (file) => {
      try {
        const result = await uploadFiles(file);
        const photosId = v4();
        const now = new Date();
        const insertPhotoResult = await pool.query(
          "INSERT INTO photos (id,court_id, url,created_at,updated_at) VALUES ($1, $2,$3,$4,$5) RETURNING id, url",
          [photosId, court_Id, result.url, now, now],
        );
        return {
          success: true,
          data: insertPhotoResult.rows[0],
          filePath: file.path,
        };
      } catch (photoError) {
        return {
          success: false,
          error: photoError.message,
          originalname: file.originalname,
          filePath: file.path,
        };
      }
    });

    const photoInsertResults = await Promise.all(photoInsertPromises);

    // Limpiar archivos temporales subidos (como antes)
    const cleanupPromises = filesToCleanup.map(async (filePath) => {
      if (!filePath) return;

      const MAX_RETRIES = 15;
      const RETRY_DELAY_MS = 300;

      for (let i = 0; i < MAX_RETRIES; i++) {
        try {
          await new Promise((resolve) =>
            setTimeout(resolve, 150 + i * RETRY_DELAY_MS),
          );
          await fs.unlink(filePath);
          return { success: true, filePath: filePath };
        } catch (unlinkError) {
          if (unlinkError.code === "EPERM") {
            if (i === MAX_RETRIES - 1) {
              return {
                success: false,
                filePath: filePath,
                error: unlinkError.message,
              };
            }
          } else if (unlinkError.code === "ENOENT") {
            return { success: true, filePath: filePath };
          } else {
            return {
              success: false,
              filePath: filePath,
              error: unlinkError.message,
            };
          }
        }
      }
    });

    await Promise.all(cleanupPromises);

    const failedPhotoOperations = photoInsertResults.filter((r) => !r.success);
    if (failedPhotoOperations.length > 0) {
      return res.status(500).json({
        message:
          "Se procesaron las imágenes, pero algunas operaciones fallaron.",
        details: failedPhotoOperations,
      });
    }

    res.status(200).json({
      message: "Imágenes y descripción subidas exitosamente.",
      court: getCourtResult.rows[0],
      uploadedPhotos: photoInsertResults.map((r) => r.data),
    });
  } catch (error) {
    // Limpieza en caso de error
    const cleanupOnFailPromises = filesToCleanup.map(async (filePath) => {
      if (!filePath) return;
      try {
        await fs.unlink(filePath);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") {
          console.error(
            `Error inesperado al limpiar el archivo ${filePath}:`,
            cleanupError,
          );
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

const uploadImagesServices = async (req, res) => {
  const { id } = req.params;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      error: "Debe subir al menos una imagen para la cancha.",
    });
  }

  const filesToCleanup = req.files.map((file) => file.path).filter(Boolean);

  try {
    // 1. Verificar si existen fotos anteriores
    const existingPhotosResult = await pool.query(
      "SELECT id, url FROM photos WHERE court_id = $1",
      [id],
    );

    const existingPhotos = existingPhotosResult.rows;

    if (existingPhotos.length > 0) {
      // 2. Eliminar imágenes del storage (Firebase, etc.)
      for (const photo of existingPhotos) {
        try {
          await deleteFileByName(photo.url);
        } catch (firebaseError) {
          console.error(
            "Error eliminando imagen previa en Firebase:",
            firebaseError,
          );
        }
      }

      // 3. Eliminar registros en DB
      await pool.query("DELETE FROM photos WHERE court_id = $1", [id]);
    }

    // 4. Subir nuevas imágenes
    const photoInsertPromises = req.files.map(async (file) => {
      try {
        const result = await uploadFiles(file);
        const photosId = v4();
        const now = new Date();
        const insertPhotoResult = await pool.query(
          "INSERT INTO photos (id, court_id, url, created_at, updated_at) VALUES ($1, $2, $3, $4, $5) RETURNING id, url",
          [photosId, id, result.url, now, now],
        );
        return {
          success: true,
          data: insertPhotoResult.rows[0],
          filePath: file.path,
        };
      } catch (photoError) {
        return {
          success: false,
          error: photoError.message,
          originalname: file.originalname,
          filePath: file.path,
        };
      }
    });

    const photoInsertResults = await Promise.all(photoInsertPromises);

    // 5. Limpiar archivos temporales
    const cleanupPromises = filesToCleanup.map(async (filePath) => {
      if (!filePath) return;

      const MAX_RETRIES = 15;
      const RETRY_DELAY_MS = 300;

      for (let i = 0; i < MAX_RETRIES; i++) {
        try {
          await new Promise((resolve) =>
            setTimeout(resolve, 150 + i * RETRY_DELAY_MS),
          );
          await fs.unlink(filePath);
          return { success: true, filePath: filePath };
        } catch (unlinkError) {
          if (unlinkError.code === "EPERM") {
            if (i === MAX_RETRIES - 1) {
              return {
                success: false,
                filePath: filePath,
                error: unlinkError.message,
              };
            }
          } else if (unlinkError.code === "ENOENT") {
            return { success: true, filePath: filePath };
          } else {
            return {
              success: false,
              filePath: filePath,
              error: unlinkError.message,
            };
          }
        }
      }
    });

    await Promise.all(cleanupPromises);

    const failedPhotoOperations = photoInsertResults.filter((r) => !r.success);

    if (failedPhotoOperations.length > 0) {
      return res.status(500).json({
        message:
          "Se procesaron las imágenes, pero algunas operaciones fallaron.",
        details: failedPhotoOperations,
      });
    }

    return res.status(200).json({
      message: "Imágenes subidas exitosamente.",
      uploadedPhotos: photoInsertResults.map((r) => r.data),
    });
  } catch (error) {
    // Limpieza en caso de error
    const cleanupOnFailPromises = filesToCleanup.map(async (filePath) => {
      if (!filePath) return;
      try {
        await fs.unlink(filePath);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") {
          console.error(
            `Error inesperado al limpiar el archivo ${filePath}:`,
            cleanupError,
          );
        }
      }
    });
    await Promise.all(cleanupOnFailPromises);

    return res.status(500).json({
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
      [id],
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
          [courtRow.id],
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
      }),
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

  const photoIdToUse = id ? String(id).replace(/\s/g, "").trim() : null;
  const courtIdToUse = courtId
    ? String(courtId).replace(/\s/g, "").trim()
    : null;

  try {
    if (!photoIdToUse || !courtIdToUse) {
      return res.status(400).json({
        success: false,
        message: "Faltan los IDs de la imagen o la cancha en la solicitud.",
      });
    }

    // PASO 1: Obtener la URL (que ahora es la ruta directa) de la base de datos
    const getPhotoResult = await pool.query(
      "SELECT url FROM photos WHERE id = $1 AND court_id = $2",
      [photoIdToUse, courtIdToUse],
    );

    if (getPhotoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "La imagen no fue encontrada o no pertenece a la cancha especificada.",
      });
    }

    const filePathInFirebase = getPhotoResult.rows[0].url; // Aquí ya tienes la ruta que Firebase espera

    if (!filePathInFirebase) {
      return res.status(500).json({
        success: false,
        message:
          "Error interno: El nombre del archivo para eliminar está vacío en la base de datos.",
      });
    }

    // PASO 2: Eliminar la imagen de la base de datos
    const deleteDbResult = await pool.query(
      "DELETE FROM photos WHERE id = $1 AND court_id = $2 RETURNING id",
      [photoIdToUse, courtIdToUse],
    );

    try {
      // PASO 3: Eliminar el archivo de Firebase Storage, usando la ruta directamente
      await deleteFileByName(filePathInFirebase);

      res.json({
        success: true,
        message: "Imagen eliminada correctamente.",
        deleted_image_id: photoIdToUse,
      });
    } catch (firebaseError) {
      console.error(
        "Error al eliminar de Firebase Storage después de borrar de la DB:",
        firebaseError,
      );
      res.status(200).json({
        success: true,
        message:
          "Imagen eliminada de la base de datos, pero hubo un error al eliminarla de Firebase Storage.",
        deleted_image_id: photoIdToUse,
        firebase_error_details: firebaseError.message,
      });
    }
  } catch (error) {
    console.error("Error general al eliminar la imagen:", error.message);
    res.status(500).json({
      success: false,
      message: "Error al eliminar la imagen.",
      details: error.message,
    });
  }
};

const getCourts = async (req, res) => {
  try {
    const result = await pool.query(`
SELECT
    c.id AS court_id,
    c.name AS court_name,
    c.user_id,
    c.address,
    c.city,
    c.phone,
    c.court_type,
    c.is_public,
    c.price,
    c.description,
    c.state,
    c.created_at,
    c.updated_at,
    c.is_court,
    c.type,
    -- Solo muestra owner_name cuando es 'court', sino NULL
    CASE 
        WHEN c.type = 'court' THEN owner_court.name 
        ELSE NULL 
    END AS owner_name,
    COALESCE(json_agg(DISTINCT jsonb_build_object('id', sc.id, 'name', sc.name, 'state', sc.state)) FILTER (WHERE sc.id IS NOT NULL), '[]') AS subcourts,
    COALESCE(json_agg(DISTINCT jsonb_build_object('id', cs.id, 'platform', cs.platform, 'url', cs.url)) FILTER (WHERE cs.id IS NOT NULL), '[]') AS court_socials,
    COALESCE(json_agg(DISTINCT jsonb_build_object('id', p.id, 'url', p.url)) FILTER (WHERE p.id IS NOT NULL), '[]') AS photos
FROM
    courts c
LEFT JOIN
    users u ON c.user_id = u.id
LEFT JOIN
    subcourts sc ON c.id = sc.court_id
LEFT JOIN
    court_socials cs ON c.id = sc.court_id
LEFT JOIN
    photos p ON c.id = p.court_id
-- Solo hace el join cuando type = 'court'
LEFT JOIN courts owner_court 
    ON c.type = 'court'  -- Condición aquí
    AND owner_court.user_id = c.user_id
GROUP BY
    c.id, u.name, owner_court.name
ORDER BY
    c.created_at DESC;
    `);
    res.status(200).json({ success: true, courts: result.rows });
  } catch (error) {
    console.error("Error al obtener canchas:", error.message);
    res
      .status(500)
      .json({ error: "Error al obtener canchas: " + error.message });
  }
};

const getServices = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT
          c.id AS court_id,
          c.name AS court_name,
          c.user_id,
          u.name AS owner_name,
          c.address,
          c.city,
          c.phone,
          c.court_type,
          c.is_public,
          c.price AS default_price,
          c.description,
          c.state,
          c.created_at,
          c.updated_at,
          c.is_court,
          COALESCE(json_agg(DISTINCT jsonb_build_object('id', p.id, 'url', p.url)) FILTER (WHERE p.id IS NOT NULL), '[]') AS photos
      FROM
          courts c
      LEFT JOIN
          photos p ON c.id = p.court_id
      WHERE
          c.id = $1
    `,
      [id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Cancha no encontrada." });
    }
    res.status(200).json({ success: true, court: result.rows[0] });
  } catch (error) {
    console.error("Error al obtener cancha por ID:", error.message);
    res
      .status(500)
      .json({ error: "Error al obtener cancha: " + error.message });
  }
};
const getCourtById = async (req, res) => {
  const { id } = req.params; // courtId
  console.log(id);

  try {
    const result = await pool.query(
      `
         SELECT
          c.id AS court_id,
          c.name AS court_name,
          c.user_id,
          u.name AS owner_name,
          c.address,
          c.city,
          c.phone,
          c.court_type,
          c.is_public,
          c.price,
          c.description,
          c.state,
          c.created_at,
          c.updated_at,
          c.is_court,
          c.type,
          COALESCE(json_agg(DISTINCT jsonb_build_object('id', p.id, 'url', p.url)) FILTER (WHERE p.id IS NOT NULL), '[]') AS photos
      FROM
          courts c
      LEFT JOIN
          users u ON c.user_id = u.id
      LEFT JOIN
          photos p ON c.id = p.court_id
      WHERE 
        c.id=$1
      GROUP BY
          c.id, u.name
      ORDER BY
          c.created_at DESC;
    `,
      [id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Cancha no encontrada." });
    }
    res.status(200).json({ success: true, court: result.rows[0] });
  } catch (error) {
    console.error("Error al obtener cancha por ID:", error.message);
    res
      .status(500)
      .json({ error: "Error al obtener cancha: " + error.message });
  }
};

const getSubCourts = async (req, res) => {
  const { id } = req.params;
  console.log(id);

  try {
    const result = await pool.query(
      `
SELECT
  sc.id AS subcourt_id,
  sc.name AS subcourt_name,
  sc.state,
  c.id
FROM
  subcourts sc
JOIN
  courts c ON sc.court_id = c.id
WHERE
  c.user_id = $1;
    `,
      [id],
    );

    const subcourts = result.rows; // El resultado de la consulta es un array de filas.
    res.status(200).json({ success: true, subcourts: subcourts });
  } catch (error) {
    console.error("Error al obtener subcanchas:", error.message);
    res
      .status(500)
      .json({ error: "Error al obtener subcanchas: " + error.message });
  }
};

const getSubCourtsName = async (req, res) => {
  const { id } = req.params;
  console.log(id);

  try {
    const result = await pool.query(
      `
SELECT
  sc.id AS subcourt_id,
  sc.name AS subcourt_name,
  sc.state,
  c.id
FROM
  subcourts sc
JOIN
  courts c ON sc.court_id = c.id
WHERE
  sc.id= $1;
    `,
      [id],
    );

    const subcourts = result.rows; // El resultado de la consulta es un array de filas.
    res.status(200).json({ success: true, subcourts: subcourts });
  } catch (error) {
    console.error("Error al obtener subcanchas:", error.message);
    res
      .status(500)
      .json({ error: "Error al obtener subcanchas: " + error.message });
  }
};

const createSubcourt = async (req, res) => {
  console.log(req.body);

  // Se obtiene el court_id de los parámetros de la URL (req.params)
  const { id } = req.params;
  const { name, state = true } = req.body;

  // Validación básica
  if (!name) {
    return res
      .status(400)
      .json({ error: "El nombre de la subcancha es obligatorio." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Verificar si la cancha existe y pertenece al usuario autenticado
    const courtResult = await client.query(
      "SELECT id FROM courts WHERE user_id = $1",
      [id],
    );

    if (courtResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cancha no encontrada." });
    }

    // 2. Insertar la nueva subcancha
    const subcourtId = v4();
    const now = new Date();
    const result = await client.query(
      "INSERT INTO subcourts (id,court_id, name, created_at, updated_at, state) VALUES ($1, $2, $3, $4, $5,$6) RETURNING *",
      [subcourtId, courtResult.rows[0].id, name, now, now, state],
    );

    await client.query("COMMIT");

    const newSubcourt = result.rows[0];

    await client.query("COMMIT");
    return res.status(201).json({
      success: true,
      message: "Subcancha creada exitosamente.",
      subcourt: newSubcourt,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al crear la subcancha:", error.message);
    return res
      .status(500)
      .json({ error: "Error al crear la subcancha: " + error.message });
  } finally {
    client.release();
  }
};

const updateCourt = async (req, res) => {
  const id = req.params.id.trim();
  const { name, description, phone, court_type } = req.body;
console.log(name)
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const now = new Date();

    const result = await client.query(
      `UPDATE courts 
       SET name = $1, description = $2, court_type = $3, phone = $4, updated_at = $5 
       WHERE user_id = $6
       RETURNING *`,
      [name, description, court_type, phone, now, id],
    );

    await client.query("COMMIT");

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: "No existe una cancha con ese ID" });
    }

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.log(error.message)
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

const deleteCourt = async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const courtResult = await client.query(
      "SELECT user_id, type FROM courts WHERE id = $1",
      [id],
    );
    const { user_id: userId, type } = courtResult.rows[0];
    if (courtResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cancha no encontrada." });
    }
    const photosResult = await client.query(
      "SELECT url FROM photos WHERE id = $1",
      [id],
    );
    const photosToDelete = photosResult.rows;

    const firebaseDeletePromises = photosToDelete.map(async (photo) => {
      try {
        const fileNameInFirebase = photo.url;

        if (fileNameInFirebase) {
          await deleteFileByName(fileNameInFirebase);
        }
        return { success: true, url: photo.url };
      } catch (firebaseError) {
        console.error(
          "Error al eliminar foto de Firebase:",
          photo.url,
          firebaseError.message,
        );
        return { success: false, url: photo.url, error: firebaseError.message };
      }
    });
    const firebaseDeletionResults = await Promise.all(firebaseDeletePromises);

    const failedFirebaseDeletions = firebaseDeletionResults.filter(
      (r) => !r.success,
    );
    if (failedFirebaseDeletions.length > 0) {
      console.warn(
        "Algunas imágenes no se pudieron eliminar de Firebase Storage:",
        failedFirebaseDeletions,
      );
    }

    // --- ¡NUEVO: ELIMINAR SUBCANCHAS ASOCIADAS PRIMERO! ---
    await client.query(
      "UPDATE subcourts SET state = false WHERE court_id = $1",
      [id],
    );
    if (type === "court") {
      await client.query("UPDATE users SET state = false WHERE id = $1", [
        userId,
      ]);
       const deleteCourtResult = await client.query("UPDATE courts SET state = false WHERE user_id = $1", [
        userId,
      ]);
    }else{
     const deleteCourtResult = await client.query(
      "UPDATE courts SET state = false WHERE id = $1",
      [id],
    );
  }

    if (deleteCourtResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ error: "Cancha no encontrada después de verificar." });
    }

     await client.query("UPDATE photos SET state=false WHERE court_id = $1", [
      id,
    ]);

    await client.query("COMMIT");
    res.status(200).json({
      success: true,
      message: "Cancha y sus datos asociados eliminados exitosamente.",
      firebase_deletion_summary:
        failedFirebaseDeletions.length > 0
          ? "Algunas imágenes no se eliminaron de Firebase."
          : "Todas las imágenes asociadas se eliminaron de Firebase.",
      failed_firebase_deletions: failedFirebaseDeletions,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al eliminar la cancha:", error.message);
    res
      .status(500)
      .json({ error: "Error al eliminar la cancha: " + error.message });
  } finally {
    client.release();
  }
};

const deleteSubcourt = async (req, res) => {
  const { subcourtId } = req.params;

  console.log(subcourtId);
  const client = await pool.connect();
  try {
    const subcourtResult = await client.query(
      "SELECT court_id FROM subcourts WHERE id = $1",
      [subcourtId],
    );

    if (subcourtResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Subcancha no encontrada." });
    }

    const courtId = subcourtResult.rows[0].court_id;

    const courtOwnerResult = await client.query(
      "SELECT user_id FROM courts WHERE id = $1",
      [courtId],
    );

    const deleteResult = await client.query(
      "DELETE FROM subcourts WHERE id = $1",
      [subcourtId],
    );

    if (deleteResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ error: "Subcancha no encontrada después de verificar." });
    }

    await client.query("COMMIT");
    res
      .status(200)
      .json({ success: true, message: "Subcancha eliminada exitosamente." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al eliminar la subcancha:", error.message);
    res
      .status(500)
      .json({ error: "Error al eliminar la subcancha: " + error.message });
  } finally {
    client.release();
  }
};

const createReservation = async (req, res) => {
  const { subcourtId } = req.params;
  const {
    user_id,
    reservation_date,
    reservation_time,
    duration,
    end_time,
    state,
    price_reservation,
    transfer,
    phone,
    user_name,
    payment_method,
  } = req.body;

  const dbClient = await pool.connect();

  try {
    await dbClient.query("BEGIN");
    // 1. Lock
    await dbClient.query(`SELECT id FROM subcourts WHERE id = $1 FOR UPDATE`, [
      subcourtId,
    ]);
    const existingReservations = await dbClient.query(
      `SELECT id FROM reservations
      WHERE subcourt_id = $1
      AND reservation_date = $2
      AND state = true
      AND (
        $3 < end_time AND $4 > reservation_time
      )
      LIMIT 1 FOR UPDATE`,
      [subcourtId, reservation_date, reservation_time, end_time],
    );
    if (existingReservations.rows.length > 0) {
      await dbClient.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        error: "Este horario ya ha sido reservado por otra persona.",
      });
    }

    const reservationId = v4();
    const now = new Date();

    // 3. Insertar la reserva
    const result = await dbClient.query(
      `INSERT INTO reservations (
                id, user_id, subcourt_id, reservation_date, reservation_time, duration,
                end_time, state, price_reservation, transfer, created_at, updated_at,
                user_name, phone, payment_method
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id, subcourt_id, reservation_date, reservation_time`,
      [
        reservationId,
        user_id,
        subcourtId,
        reservation_date,
        reservation_time,
        duration,
        end_time,
        state,
        price_reservation,
        transfer,
        now,
        now,
        user_name,
        phone,
        payment_method,
      ],
    );

    await dbClient.query("COMMIT");

    const dateForTemplate = new Date(
      reservation_date + "T00:00:00",
    ).toLocaleDateString("es-CO", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const timeForTemplate = new Date(
      `${reservation_date}T${reservation_time}:00`,
    ).toLocaleTimeString("es-CO", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const durationInHours = duration / 60;
    const durationForTemplate =
      duration % 60 === 0
        ? `${durationInHours} hora${durationInHours > 1 ? "s" : ""}`
        : `${duration} minutos`;
    const priceForTemplate = new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
    }).format(price_reservation);

    const namecancha = await pool.query(
      `SELECT c.name as courtname, s.name as subcourtname 
             FROM subcourts s
             INNER JOIN courts c ON c.id = s.court_id 
             WHERE s.id = $1`,
      [subcourtId],
    );

    const names = namecancha.rows[0] || {
      courtname: "N/A",
      subcourtname: "N/A",
    };

    const messageBody = `¡Hola ${user_name}! Tu reserva ha sido confirmada.\nCancha: ${names.courtname}\nSubcancha: ${names.subcourtname}\nFecha: ${dateForTemplate}\nHora: ${timeForTemplate}\nDuración: ${durationForTemplate}\nPrecio: ${priceForTemplate}\n\n¡Gracias por tu reserva!`;

    try {
      await twilioClient.messages.create({
        body: messageBody,
        from: "whatsapp:+14155238886",
        to: `whatsapp:+57${phone}`,
      });
    } catch (wsErr) {
      console.error("Error Twilio:", wsErr.message);
    }

    return res.status(201).json({
      success: true,
      reservation: result.rows[0],
    });
  } catch (error) {
    await dbClient.query("ROLLBACK");
    console.error("Error en createReservation:", error.message);

    if (error.code === "23503") {
      return res
        .status(400)
        .json({ error: "El subcourt_id o user_id no existe." });
    }

    return res.status(500).json({ error: "Error al crear la reserva." });
  } finally {
    dbClient.release();
  }
};

const deleteReservation = async (req, res) => {
  const { id } = req.params;
  console.log(id);
  try {
    // Verificar si la reserva existe
    const existingReservation = await pool.query(
      `SELECT * FROM reservations WHERE id = $1`,
      [id],
    );

    if (existingReservation.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "La reserva no existe o ya fue eliminada.",
      });
    }

    // Eliminar la reserva
    await pool.query(
      `UPDATE reservations SET state = false, updated_at = NOW() WHERE id = $1`,
      [id],
    );

    // (Opcional) Enviar notificación por WhatsApp
    const { user_name, phone, reservation_date, reservation_time } =
      existingReservation.rows[0];
    const rawPhoneNumber = phone ? phone.replace(/\D/g, "") : null;
    const phoneNumberForTwilio = rawPhoneNumber
      ? `whatsapp:+${rawPhoneNumber}`
      : null;

    if (phoneNumberForTwilio) {
      try {
        const dateForTemplate = new Date(
          reservation_date + "T00:00:00",
        ).toLocaleDateString("es-CO", {
          weekday: "long",
          day: "numeric",
          month: "long",
        });
        const timeForTemplate = new Date(
          `${reservation_date}T${reservation_time}:00`,
        ).toLocaleTimeString("es-CO", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });

        const messageBody = `Hola ${user_name}, tu reserva para el día ${dateForTemplate} a las ${timeForTemplate} ha sido cancelada correctamente.`;

        await client.messages.create({
          body: messageBody,
          from: "whatsapp:+14155238886",
          to: phoneNumberForTwilio,
        });
      } catch (twilioError) {
        console.error(
          "Error al enviar notificación de cancelación:",
          twilioError.message,
        );
      }
    }

    res.status(200).json({
      success: true,
      message: "Reserva eliminada correctamente.",
    });
  } catch (error) {
    console.error("Error al eliminar reserva:", error.message);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor al eliminar la reserva.",
      details: error.message,
    });
  }
};

const getReservationsBySubcourt = async (req, res) => {
  const { subcourtId } = req.params;

  try {
    const result = await pool.query(
      `SELECT 
                reservation_date,
                reservation_time,
                duration
            FROM reservations 
            WHERE subcourt_id = $1 AND state = true`,
      [subcourtId],
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error al obtener las reservas:", error.message);
    res.status(500).json({
      error: "Error interno del servidor al obtener las reservas.",
      details: error.message,
    });
  }
};

const sendReservationReminder = async (req, res) => {
  const { reservationId } = req.params;

  try {
    // 1️⃣ Buscar la reserva
    const result = await pool.query(
      `SELECT * FROM reservations WHERE id = $1`,
      [reservationId],
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Reserva no encontrada" });
    }
    const namecancha = await pool.query(
      `SELECT courts.name, subcourts.name as subcourtName FROM subcourts inner join courts on courts.id = subcourts.court_id WHERE subcourts.id = $1`,
      [reservation.subcourt_id],
    );

    const name = namecancha.rows[0];
    const reservation = result.rows[0];

    // 2️⃣ Formatear teléfono
    const rawPhone = reservation.phone.replace(/\D/g, "");
    const phoneForTwilio = `whatsapp:+${rawPhone}`;

    // 3️⃣ Formatear fecha
    const dateForTemplate = new Date(
      reservation.reservation_date + "T00:00:00",
    ).toLocaleDateString("es-CO", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

    // 4️⃣ Formatear hora
    const timeForTemplate = new Date(
      `${reservation.reservation_date}T${reservation.reservation_time}:00`,
    ).toLocaleTimeString("es-CO", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    // 5️⃣ Duración
    const durationHours = reservation.duration / 60;
    const durationForTemplate =
      reservation.duration % 60 === 0
        ? `${durationHours} hora${durationHours > 1 ? "s" : ""}`
        : `${reservation.duration} minutos`;

    // 6️⃣ Precio
    const priceForTemplate = new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
    }).format(reservation.price_reservation);

    // 7️⃣ Mensaje
    const messageBody = `🔔 *Recordatorio de tu reserva*

Hola ${reservation.user_name}

Cancha: ${name.name}
Subcancha:${name.subcourtName}
Fecha: ${dateForTemplate}
Hora: ${timeForTemplate}
Duración: ${durationForTemplate}
Precio: ${priceForTemplate}

Te esperamos 👌`;

    // 8️⃣ Enviar WhatsApp
    try {
      await client.messages.create({
        body: messageBody,
        from: "whatsapp:+14155238886",
        to: phoneForTwilio,
      });
    } catch (twilioError) {
      console.error("Twilio error:", twilioError.message);
    }

    res.json({ success: true, message: "Recordatorio enviado" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error enviando recordatorio" });
  }
};

const updateTransferWithPrice = async (req, res) => {
  const { id } = req.params;

  try {
    // 1️⃣ Obtener price_reservation actual
    const result = await pool.query(
      "SELECT price_reservation FROM reservations WHERE id = $1",
      [id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Reserva no existe" });
    }

    const price = result.rows[0].price_reservation;

    // 2️⃣ Hacer UPDATE automático
    const update = await pool.query(
      `UPDATE reservations
       SET transfer = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [price, id],
    );

    return res.json({
      success: true,
      reservation: update.rows[0],
    });
  } catch (error) {
    console.error("Pay all error:", error.message);
    res.status(500).json({ success: false, error: "Error interno" });
  }
};

const updateReservation = async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  try {
    // 1️⃣ Verificar que existe
    const existing = await pool.query(
      `SELECT * FROM reservations WHERE id = $1`,
      [id],
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "La reserva no existe",
      });
    }

    // 2️⃣ Construir UPDATE dinámico
    const fields = [];
    const values = [];
    let index = 1;

    for (const key in data) {
      if (data[key] !== undefined && data[key] !== null && data[key] !== "") {
        fields.push(`${key} = $${index}`);
        values.push(data[key]);
        index++;
      }
    }

    // Siempre actualizar updated_at
    fields.push(`updated_at = NOW()`);

    if (fields.length === 1) {
      return res.status(400).json({
        success: false,
        message: "No se enviaron datos para actualizar",
      });
    }

    const query = `
            UPDATE reservations
            SET ${fields.join(", ")}
            WHERE id = $${index}
            RETURNING *
        `;

    values.push(id);

    const result = await pool.query(query, values);
    const updated = result.rows[0];

    // 3️⃣ WhatsApp si cambió algo importante
    if (
      updated.phone &&
      (data.reservation_date || data.reservation_time || data.price_reservation)
    ) {
      try {
        const rawPhone = updated.phone.replace(/\D/g, "");
        const phoneNumberForTwilio = `whatsapp:+${rawPhone}`;

        const dateForTemplate = new Date(
          updated.reservation_date + "T00:00:00",
        ).toLocaleDateString("es-CO", {
          weekday: "long",
          day: "numeric",
          month: "long",
        });

        const timeForTemplate = new Date(
          `${updated.reservation_date}T${updated.reservation_time}:00`,
        ).toLocaleTimeString("es-CO", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });

        const priceForTemplate = new Intl.NumberFormat("es-CO", {
          style: "currency",
          currency: "COP",
        }).format(updated.price_reservation);

        const msg = `Hola ${updated.user_name}, tu reserva fue modificada:

📅 ${dateForTemplate}
⏰ ${timeForTemplate}
💰 ${priceForTemplate}

Si tienes dudas escríbenos.`;

        await client.messages.create({
          body: msg,
          from: "whatsapp:+14155238886",
          to: phoneNumberForTwilio,
        });
      } catch (err) {
        console.error("Error WhatsApp update:", err.message);
      }
    }

    return res.status(200).json({
      success: true,
      reservation: updated,
    });
  } catch (error) {
    console.error("Error update:", error.message);
    res.status(500).json({
      success: false,
      error: "Error interno al actualizar",
      details: error.message,
    });
  }
};

const getSubCourtPrice = async (req, res) => {
  const { subcourtId } = req.params;

  try {
    const result = await pool.query(
      ` SELECT
    sc.id,
    sc.name,
    sc.state,
    json_object_agg(sp.day_of_week, sp.price) AS price
FROM
    subcourts sc
LEFT JOIN
    subcourt_prices sp ON sc.id = sp.subcourt_id
WHERE
    sc.id = $1 
GROUP BY
    sc.id, sc.name, sc.state;`,
      [subcourtId],
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error al obtener las reservas:", error.message);
    res.status(500).json({
      error: "Error interno del servidor al obtener las reservas.",
      details: error.message,
    });
  }
};

const updateSubCourtAndPrices = async (req, res) => {
  const { subcourtId } = req.params;
  const { name, price, state } = req.body;

  console.log("Datos recibidos:", { name, price, state }); // Log data for debugging

  const client = await pool.connect();

  try {
    await client.query("BEGIN"); // Start transaction

    // 1. Update the 'subcourts' table
    await client.query(
      "UPDATE subcourts SET name = $1, state = $2 WHERE id = $3",
      [name, state, subcourtId],
    );

    // 2. UPSERT prices in the 'subcourt_prices' table for each day
    const days = Object.keys(price);
    for (const day of days) {
      const priceValue = price[day];

      // ✅ Use UPSERT (INSERT ... ON CONFLICT)
      await client.query(
        `update subcourt_prices set price =$1 where day_of_week = $2 and subcourt_id =$3`,
        [priceValue, day, subcourtId],
      );
    }

    await client.query("COMMIT"); // Commit the transaction

    res.status(200).json({
      message: "Subcancha y precios actualizados exitosamente.",
      data: { name, price, state },
    });
  } catch (error) {
    await client.query("ROLLBACK"); // Roll back on error
    console.error("Error al actualizar la subcancha:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  } finally {
    client.release();
  }
};

const getUserCourtsReservations = async (req, res) => {
  const { Id } = req.params; // Captura el ID del dueño de la cancha desde la URL

  if (!Id) {
    return res.status(400).json({ error: "El ID del usuario es obligatorio." });
  }

  try {
    const result = await pool.query(
      `
            SELECT
                r.id AS reservation_id,
                r.reservation_date,
                r.reservation_time,
                r.duration,
                r.end_time,
                r.state,
                r.price_reservation,
                r.transfer,
                r.created_at,
                r.updated_at,
                r.user_name AS client_name,
                r.phone AS client_phone,
                sc.id AS subcourt_id,
                sc.name AS subcourt_name,
                c.id AS court_id,
                c.name AS court_name
            FROM
                reservations r
            JOIN
                subcourts sc ON r.subcourt_id = sc.id
            JOIN
                courts c ON sc.court_id = c.id
            WHERE
                c.user_id = $1
            ORDER BY
                r.reservation_date DESC, r.reservation_time DESC;
            `,
      [Id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No se encontraron reservas para las canchas de este usuario.",
        reservations: [],
      });
    }

    res.status(200).json({
      success: true,
      message: "Reservas obtenidas exitosamente.",
      reservations: result.rows,
    });
  } catch (error) {
    console.error("Error al obtener las reservas:", error.message);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor al obtener las reservas.",
      details: error.message,
    });
  }
};

const getUserReservationsByDate = async (req, res) => {
  // 1. Validar y capturar los parámetros
  // La subcancha ID se obtiene de los parámetros de la URL (:id)
  const { id } = req.params;
  // La fecha de la reserva se obtiene de los query parameters (?reservationDate=...)
  const { reservationDate } = req.query;

  console.log(reservationDate + "date");

  // 2. Validación
  if (!id || !reservationDate) {
    return res.status(400).json({
      success: false,
      error:
        "El ID de la subcancha y la fecha de reservación son obligatorios.",
    });
  }

  try {
    // 3. Ejecutar la consulta SQL
    const result = await pool.query(
      `
            SELECT
                r.id AS reservation_id,
                r.reservation_date,
                r.reservation_time,
                r.duration,
                r.end_time,
                r.state,
                r.price_reservation,
                r.transfer,
                r.created_at,
                r.updated_at,
                r.user_name AS client_name,
                r.phone AS client_phone,
                sc.id AS subcourt_id,
                sc.name AS subcourt_name,
                c.id AS court_id,
                c.name AS court_name,
                r.user_id,
                r.missing_quantity
            FROM
                reservations r
            JOIN
                subcourts sc ON r.subcourt_id = sc.id
            JOIN
                courts c ON sc.court_id = c.id            
            WHERE
                sc.id = $1 AND r.reservation_date = $2 and r.state = true
            ORDER BY
                r.reservation_time ASC;
            `,
      [id, reservationDate],
    );

    // 4. Devolver la respuesta
    // Cambio clave aquí: Siempre devolver 200 OK.
    // Si no hay filas, el array 'result.rows' estará vacío, lo cual es lo que el frontend espera para saber que no hay reservas.
    res.status(200).json({
      success: true,
      message: "Reservas obtenidas exitosamente.",
      reservations: result.rows,
    });
  } catch (error) {
    console.error("Error al obtener las reservas:", error.message);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor al obtener las reservas.",
      details: error.message,
    });
  }
};

// controllers/authController.js

const registerProveedor = async (req, res) => {
  // 1. Obtener los errores de validación
  const errors = validationResult(req);

  // 2. Si hay errores, enviar una respuesta de error y detener la ejecución
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Si no hay errores, el código continúa
  const { email, password, name, role, phone } = req.body;

  try {
    await pool.query("BEGIN");

    const user_id = v4();
    const hashedPassword = await hash(password, 10);
    const now = new Date();

    // Inserción del usuario (proveedor)
    await pool.query(
      "INSERT INTO users(id, name, email, password, role, phone, state, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [user_id, name, email, hashedPassword, role, phone, true, now, now],
    );

    await pool.query("COMMIT");
    return res.status(201).json({
      success: true,
      message: "El registro fue exitoso y todos los datos fueron guardados.",
      user: user_id,
    });
  } catch (error) {
    // Si algo falla, hacer rollback y enviar un error al cliente
    await pool.query("ROLLBACK");
    console.error("Error en el registro del proveedor:", error);
    return res.status(500).json({
      success: false,
      message: "Hubo un problema al registrar el proveedor.",
      error: error.message,
    });
  }
};

const getSubcourtPriceByDate = async (req, res) => {
  try {
    const { id } = req.params;
    const { reservationDate } = req.query;

    if (!id || !reservationDate) {
      return res.status(400).json({
        success: false,
        error: "El ID de la subcancha y la fecha son obligatorios.",
      });
    }

    const [year, month, day] = reservationDate.split("-").map(Number);
    const localDate = new Date(year, month - 1, day);

    const days = [
      "domingo",
      "lunes",
      "martes",
      "miercoles",
      "jueves",
      "viernes",
      "sábado",
    ];

    const dayOfWeek = days[localDate.getDay()];

    console.log("📅 Fecha recibida:", reservationDate);
    console.log("🗓️ Día calculado:", dayOfWeek);

    const result = await pool.query(
      `
      SELECT price, day_of_week
      FROM subcourt_prices
      WHERE subcourt_id = $1
        AND LOWER(day_of_week) = $2
      LIMIT 1;
      `,
      [id, dayOfWeek],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No se encontró precio configurado para el día "${dayOfWeek}".`,
      });
    }

    res.status(200).json({
      success: true,
      price: result.rows[0].price,
      day_of_week: result.rows[0].day_of_week,
    });
  } catch (error) {
    console.error("Error al obtener el precio:", error.message);
    res.status(500).json({
      success: false,
      error: "Error interno al obtener el precio.",
    });
  }
};

const getReservationActive = async (req, res) => {
  const { Id } = req.params;
  console.log("ID recibido:", Id); // Log para verificar la entrada

  try {
    const result = await pool.query(
      `
            SELECT 
                r.reservation_date,
                r.reservation_time,
                r.state, 
                sc.name AS subcourt_name,
                r.price_reservation ,
                r.duration,
                sc.id AS subcourt_id,
                r.end_time
            FROM
                reservations r
            JOIN
                subcourts sc ON r.subcourt_id = sc.id
            JOIN
                courts c ON sc.court_id = c.id
            WHERE
                c.user_id = $1 
                 AND r.reservation_date >= date_trunc('day', now() AT TIME ZONE 'America/Bogota')
            ORDER BY
                r.reservation_date DESC, r.reservation_time DESC
            `,
      [Id],
    );

    console.log(`Reservas encontradas para ID ${Id}: ${result.rows.length}`);

    // El estado HTTP 200 es correcto
    return res.status(200).json({
      success: true,
      reservations: result.rows,
    });
  } catch (error) {
    // 🚨 CAMBIO IMPORTANTE: Mostrar el error real de la base de datos
    console.error(
      "Error al obtener las reservas activas:",
      error.message || error,
    );

    // Asegúrate de que el mensaje de error para el cliente sea genérico
    res.status(500).json({
      error: "Error interno del servidor al obtener las reservas.",
    });
  }
};

const getPromotionsByUser = async (req, res) => {
  const { id } = req.params; // user_id
  try {
    const result = await pool.query(
      `
      SELECT 
        c.id AS court_id,
        c.user_id,
        c.name AS  court_name,
        c.description,
        c.city,
        c.address,
        c.phone,
        c.price,
        c.created_at,
        c.updated_at,
        c.state,
        c.type,
        COALESCE(json_agg(DISTINCT jsonb_build_object('id', p.id, 'url', p.url)) 
          FILTER (WHERE p.id IS NOT NULL), '[]') AS photos
      FROM courts c
      LEFT JOIN photos p ON c.id = p.court_id
      WHERE c.type in ('promotion','services') AND c.user_id = $1 and c.state=true
      GROUP BY c.id
      ORDER BY c.created_at DESC
      `,
      [id],
    );

    return res.status(200).json({
      success: true,
      message: "Promociones obtenidas correctamente.",
      courts: result.rows,
    });
  } catch (error) {
    console.error("Error al obtener promociones:", error);
    return res.status(500).json({
      success: false,
      message: "Hubo un error al obtener las promociones.",
      error: error.message,
    });
  }
};

// 1. Reservations by Day of the Week
const getReservationsByDay = async (req, res) => {
  const { id } = req.params;
  const { year, month } = req.query;

  let query = `
        SELECT
            TRIM(TO_CHAR(reservation_date, 'Day')) AS dia_semana,
            EXTRACT(DOW FROM reservation_date) AS orden,
            COUNT(id) AS total_reservas
        FROM reservations
        WHERE subcourt_id = $1
          AND state = true
    `;

  const params = [id];
  let paramIndex = 2;

  if (year) {
    query += ` AND EXTRACT(YEAR FROM reservation_date) = $${paramIndex} `;
    params.push(year);
    paramIndex++;
  }

  if (month) {
    query += ` AND EXTRACT(MONTH FROM reservation_date) = $${paramIndex} `;
    params.push(month);
    paramIndex++;
  }

  query += `
        GROUP BY dia_semana, orden
        ORDER BY orden ASC
    `;

  try {
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener reservas por día:", error);
    return res.status(500).json({
      error: "Fallo al obtener datos de reservas por día.",
    });
  }
};

// 2. Total Reservations by Hour (Demand Trend)
const getReservationsByHour = async (req, res) => {
  const { id } = req.params;
  const { year, month } = req.query;
  console.log("dwdwdw" + year + month);

  let query = `
        SELECT
            TO_CHAR(reservation_time, 'HH24') AS hora_inicio,
            COUNT(id) AS total_reservas
        FROM reservations
        WHERE subcourt_id = $1 AND state = true
    `;
  const params = [id];
  let paramIndex = 2;
  // Filtro dinámico por año
  if (year) {
    query += ` AND EXTRACT(YEAR FROM reservation_date) = $${paramIndex} `;
    params.push(Number(year));
    paramIndex++;
  }

  // Filtro dinámico por mes
  if (month) {
    query += ` AND EXTRACT(MONTH FROM reservation_date) = $${paramIndex} `;
    params.push(month);
    paramIndex++;
  }

  query += `
        GROUP BY hora_inicio
        ORDER BY hora_inicio ASC;
    `;

  try {
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener reservas por hora:", error);
    return res.status(500).json({
      error: "Fallo al obtener datos de reservas por hora.",
    });
  }
};

// 3. Peak and Off-Peak Hours (Detection)
const getPeakOffPeakHours = async (req, res) => {
  const { id } = req.params;
  const { year, month } = req.query;

  let baseQuery = `
        SELECT
            TO_CHAR(reservation_time, 'HH24') AS hora,
            COUNT(id) AS total_reservas
        FROM reservations
        WHERE subcourt_id = $1 AND state = true
    `;
  const params = [id];
  let paramIndex = 2;
  // Filtro por año
  if (year) {
    baseQuery += ` AND EXTRACT(YEAR FROM reservation_date) = $${paramIndex} `;
    params.push(year);
    paramIndex++;
  }

  // Filtro por mes
  if (month) {
    baseQuery += ` AND EXTRACT(MONTH FROM reservation_date) = $${paramIndex} `;
    params.push(month);
    paramIndex++;
  }

  const query = `
        WITH ResumenPorHora AS (
            ${baseQuery}
            GROUP BY hora
        )
        (
            SELECT
                'hot' AS tipo,
                hora,
                total_reservas
            FROM ResumenPorHora
            ORDER BY total_reservas DESC
            LIMIT 1
        )
        UNION ALL
        (
            SELECT
                'cold' AS tipo,
                hora,
                total_reservas
            FROM ResumenPorHora
            ORDER BY total_reservas ASC
            LIMIT 1
        )
        ORDER BY tipo DESC;
    `;

  try {
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener horarios pico/valle:", error);
    return res.status(500).json({
      error: "Fallo al obtener horarios de máxima y mínima demanda.",
    });
  }
};

const getPeriodicReservations = async (req, res) => {
  const { id } = req.params;
  const { year, month } = req.query;

  let query = `
        SELECT
            EXTRACT(YEAR FROM reservation_date) AS anio,
            TO_CHAR(reservation_date, 'TMMonth') AS mes,
            COUNT(id) AS total_reservas
        FROM reservations
        WHERE subcourt_id = $1
          AND state = true
    `;

  const params = [id];
  let paramIndex = 2;

  if (year) {
    query += ` AND EXTRACT(YEAR FROM reservation_date) = $${paramIndex} `;
    params.push(year);
    paramIndex++;
  }

  if (month) {
    query += ` AND EXTRACT(MONTH FROM reservation_date) = $${paramIndex} `;
    params.push(month);
    paramIndex++;
  }

  query += `
        GROUP BY anio, mes
        ORDER BY anio ASC,
                 MIN(reservation_date) ASC
    `;

  try {
    console.log("QUERY:", query);
    console.log("PARAMS:", params);

    const result = await pool.query(query, params);

    return res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener reservas periódicas:", error);
    return res.status(500).json({
      error: "Fallo al obtener el histórico de reservas.",
    });
  }
};

// 5. Frequent Clients (Top 10)
const getFrequentClients = async (req, res) => {
  const { id } = req.params;
  const { year, month } = req.query;

  console.log("data" + id, year, month);
  let query = `
        SELECT
            user_id,
            user_name,
            COUNT(id) AS total_reservas
        FROM reservations
        WHERE subcourt_id = $1
          AND state = true
    `;

  const params = [id];
  let paramIndex = 2;

  // Filtro dinámico por año
  if (year) {
    query += ` AND EXTRACT(YEAR FROM reservation_date) = $${paramIndex} `;
    params.push(year);
    paramIndex++;
  }

  // Filtro dinámico por mes
  if (month) {
    query += ` AND EXTRACT(MONTH FROM reservation_date) = $${paramIndex} `;
    params.push(month);
    paramIndex++;
  }

  query += `
        GROUP BY user_id, user_name
        ORDER BY total_reservas DESC
        LIMIT 10;
    `;

  try {
    const result = await pool.query(query, params);
    console.log(result.rows);
    return res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener clientes frecuentes:", error);
    return res.status(500).json({
      error: "Fallo al obtener la lista de clientes frecuentes.",
    });
  }
};

// 6. Total Revenue by Payment Method
const getRevenueByPaymentMethod = async (req, res) => {
  const { id } = req.params;
  const { year, month } = req.query;
  console.log(year + month);
  let query = `
            SELECT
                payment_method AS medio_pago,
                COUNT(id) AS total_reservas,
                SUM(transfer) AS recaudo_total,
                COALESCE(SUM(missing_quantity),0) AS faltante_total
            FROM reservations
            WHERE subcourt_id = $1
              AND state = true
        `;

  const params = [id];
  let paramIndex = 2;

  if (year) {
    query += ` AND EXTRACT(YEAR FROM reservation_date) = $${paramIndex} `;
    params.push(year);
    paramIndex++;
  }

  if (month) {
    query += ` AND EXTRACT(MONTH FROM reservation_date) = $${paramIndex} `;
    params.push(month);
    paramIndex++;
  }

  query += `
            GROUP BY payment_method
            ORDER BY recaudo_total DESC
        `;

  const result = await pool.query(query, params);
  console.log("Recaudo por Método de Pago:", result.rows);
  return res.json(result.rows);
};

const getCourtPhone = async (req, res) => {
  const { id } = req.params;
  console.log(id);
  try {
    const result = await pool.query(
      "SELECT c.phone from subcourts s inner join courts c on s.court_id = c.id where s.id=$1",
      [id],
    );
    console.log(result);
    res.status(200).json({ success: true, courts: result.rows[0] });
  } catch (error) {
    console.error("Error al obtener canchas:", error.message);
    res
      .status(500)
      .json({ error: "Error al obtener canchas: " + error.message });
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
  getCourts,
  getCourtById,
  updateCourt,
  deleteCourt,
  deleteSubcourt,
  createReservation,
  logout,
  getServices,
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
  updateTransferWithPrice,
  getCourtPhone,
};
