const pool = require("../constants/db");
const { hash } = require("bcrypt");
const { verify, sign } = require("jsonwebtoken");
const { v4 } = require("uuid");
const { SECRET } = require("../constants");
const {
  uploadFiles,
  deleteFileByName
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
    court_type,
    price,
    is_public,
    description,
    state,
    subcourts
  } = req.body;

  console.log(req.body);
  console.log(court_type);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const user_id = v4();
    const hashedPassword = await hash(password, 10);

    await client.query(
      "insert into users(id,name,email,password,role,phone,state) values ($1, $2,$3,$4,$5,$6,$7) ",
      [user_id, name, email, hashedPassword, role, phone,state]
    );

    const courtId = v4();
    const now = new Date();

    await client.query(
      "insert into courts(id, name, address, city, phone, court_type, is_public,price, description, created_at, updated_at, state, user_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,$12,$13)",
      [courtId, courtName, courtAddress, courtCity, courtPhone, court_type, is_public,price, description, now, now, state,user_id]
    );

    if (subcourts && Array.isArray(subcourts) && subcourts.length > 0) {
      for (const subcourt of subcourts) {
        const subcourtId = v4();
        const { subcourtName, state: subcourtState } = subcourt;

        await client.query(
          "insert into subcourts(id, court_id, name, created_at, updated_at, state) values ($1, $2, $3, $4, $5, $6)",
          [subcourtId, courtId, subcourtName, now, now, subcourtState]
        );
      }
    }

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: "El registro fue exitoso y todos los datos fueron guardados.",
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error en el registro (transacción revertida):", error.message);
    return res.status(500).json({
      error: error.message,
      message: "No se pudo completar el registro debido a un error. Ningún dato fue guardado."
    });
  } finally {
    client.release();
  }
};

const registerServices = async (req,res) => {
  const {
    courtName, 
    courtAddress,
    courtCity,
    courtPhone,
    price,
    description,
    state
  } = req.body;

 const { userId } = req.params;

 console.log(req.body);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const serviceId = v4();
    const now = new Date();

    // Insertar solo en la tabla 'courts'
    await client.query(
      "insert into courts(id, name, address, city, phone, price, description, created_at, updated_at, state, user_id, is_court) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
      [serviceId, courtName, courtAddress, courtCity, courtPhone, price, description, now, now, state, userId, false]
    );

    await client.query('COMMIT');
        return res.status(201).json({
      success: true,
      message: "El registro del servicio fue exitoso y todos los datos fueron guardados.",
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error en el registro del servicio (transacción revertida):", error.message);
    throw new Error("No se pudo completar el registro del servicio.");
  } finally {
    client.release();
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

const logout =async(req, res) => {
    try {
        return res.status(200).clearCookie('token',{httpOnly:true}).json({
            success: true,
            message: "Logged out succefully ",
        })
    } catch (error) {
        console.log(error.message)
        return res.status(500).json({
            error:error.message
        })
    }
}

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

    let court_Id = getCourtResult.rows[0].id;
console.log(court_Id);
    const courtResult = await pool.query(
      "UPDATE courts SET description = $1, updated_at = NOW() WHERE id = $2 RETURNING id,name",
      [description, court_Id]
    );

    const photoInsertPromises = req.files.map(async (file) => {
      try {
        const result = await uploadFiles(file);
         const photosId = v4();
         const now = new Date();
        const insertPhotoResult = await pool.query(
          "INSERT INTO photos (id,court_id, url,created_at,updated_at) VALUES ($1, $2,$3,$4,$5) RETURNING id, url",
          [photosId,court_Id, result.url,now,now]
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
      message: "Imágenes y descripción subidas exitosamente.",
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
          console.error(`Error inesperado al limpiar el archivo ${filePath}:`, cleanupError);
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
            [photoIdToUse, courtIdToUse]
        );

        if (getPhotoResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "La imagen no fue encontrada o no pertenece a la cancha especificada.",
            });
        }

        const filePathInFirebase = getPhotoResult.rows[0].url; // Aquí ya tienes la ruta que Firebase espera

        if (!filePathInFirebase) {
            return res.status(500).json({
                success: false,
                message: "Error interno: El nombre del archivo para eliminar está vacío en la base de datos.",
            });
        }

        // PASO 2: Eliminar la imagen de la base de datos
        const deleteDbResult = await pool.query(
            "DELETE FROM photos WHERE id = $1 AND court_id = $2 RETURNING id",
            [photoIdToUse, courtIdToUse]
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
            console.error("Error al eliminar de Firebase Storage después de borrar de la DB:", firebaseError);
            res.status(200).json({
                success: true,
                message: "Imagen eliminada de la base de datos, pero hubo un error al eliminarla de Firebase Storage.",
                deleted_image_id: photoIdToUse,
                firebase_error_details: firebaseError.message
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
const createPost = async (req, res) => {
  const { title, content } = req.body;
  const userId = req.user.id; 
  const state = true;
  if (!title || !content) {
    return res.status(400).json({ error: "Título y contenido son obligatorios para un post." });
  }

  const filesToCleanup = req.files ? req.files.map(file => file.path).filter(Boolean) : [];

  try {
    const postId = v4();
    const now = new Date();

    await pool.query(
      "INSERT INTO posts (id, user_id, title, content, created_at, updated_at, state) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [postId, userId, title, content, now, now, state]
    );

    if (req.files && req.files.length > 0) {
      const photoInsertPromises = req.files.map(async (file) => {
        try {
          const result = await uploadFiles(file); 
          await pool.query(
            "INSERT INTO post_photos (id, post_id, url, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
            [v4(), postId, result.url, now, now]
          );
          return { success: true, url: result.url, filePath: file.path };
        } catch (photoError) {
          return { success: false, error: photoError.message, originalname: file.originalname, filePath: file.path };
        }
      });

      const photoInsertResults = await Promise.all(photoInsertPromises);
      const failedPhotoOperations = photoInsertResults.filter(r => !r.success);

      if (failedPhotoOperations.length > 0) {
        console.warn("Algunas imágenes no se pudieron subir para el post:", postId, failedPhotoOperations);
      }
    }

    const cleanupPromises = filesToCleanup.map(async (filePath) => {
      if (!filePath) return;
      try {
        await fs.unlink(filePath);
      } catch (unlinkError) {
        if (unlinkError.code !== "ENOENT") {
          console.error("Error al limpiar archivo local:", filePath, unlinkError.message);
        }
      }
    });
    await Promise.all(cleanupPromises);

    return res.status(201).json({
      success: true,
      message: "Post creado exitosamente.",
      postId: postId,
    });

  } catch (error) {
    const cleanupOnFailPromises = filesToCleanup.map(async (filePath) => {
      if (!filePath) return;
      try {
        await fs.unlink(filePath);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") {
          console.error("Error durante la limpieza después de un fallo:", filePath, cleanupError.message);
        }
      }
    });
    await Promise.all(cleanupOnFailPromises);

    console.error("Error al crear post:", error.message);
    return res.status(500).json({
      error: "Error al crear post: " + error.message,
    });
  }
};
const getPosts = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                p.id AS post_id,
                p.user_id,
                u.name AS user_name,
                p.title,
                p.content,
                p.state,
                p.created_at,
                p.updated_at,
                json_agg(json_build_object('id', pp.id, 'url', pp.url)) FILTER (WHERE pp.id IS NOT NULL) AS photos
            FROM
                posts p
            LEFT JOIN
                users u ON p.user_id = u.id -- Unir con la tabla users para obtener el nombre del usuario
            LEFT JOIN
                post_photos pp ON p.id = pp.post_id
            GROUP BY
                p.id, u.name -- Agrupar también por el nombre del usuario
            ORDER BY
                p.created_at DESC;
        `);
        return res.status(200).json({ success: true, posts: result.rows });
    } catch (error) {
        console.error("Error al obtener posts:", error.message);
        return res.status(500).json({ error: "Error al obtener posts: " + error.message });
    }
};


const getPostById = async (req, res) => {
    const { id } = req.params; 

    try {
        const result = await pool.query(`
            SELECT
                p.id AS post_id,
                p.user_id,
                u.name AS user_name,
                p.title,
                p.content,
                p.state,
                p.created_at,
                p.updated_at,
                json_agg(json_build_object('id', pp.id, 'url', pp.url)) FILTER (WHERE pp.id IS NOT NULL) AS photos
            FROM
                posts p
            LEFT JOIN
                users u ON p.user_id = u.id
            LEFT JOIN
                post_photos pp ON p.id = pp.post_id
            WHERE
                p.id = $1
            GROUP BY
                p.id, u.name;
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Post no encontrado." });
        }

        return res.status(200).json({ success: true, post: result.rows[0] });
    } catch (error) {
        console.error("Error al obtener post por ID:", error.message);
        return res.status(500).json({ error: "Error al obtener post: " + error.message });
    }
};

const updatePost = async (req, res) => {
    const { id } = req.params; // ID del post
    const { title, content, state } = req.body;
    const userId = req.user.id; 
    const filesToCleanup = req.files ? req.files.map(file => file.path).filter(Boolean) : [];

    try {
        const postResult = await pool.query(
            "SELECT user_id FROM posts WHERE id = $1",
            [id]
        );

        if (postResult.rows.length === 0) {
            return res.status(404).json({ error: "Post no encontrado." });
        }

        const postOwnerId = postResult.rows[0].user_id;

        if (userId !== postOwnerId && req.user.role !== 'admin') {
            return res.status(403).json({ error: "No tienes permiso para actualizar este post." });
        }

        const now = new Date();
        await pool.query(
            "UPDATE posts SET title = $1, content = $2, state = $3, updated_at = $4 WHERE id = $5",
            [title, content, state, now, id]
        );

        if (req.files && req.files.length > 0) {
            const photoInsertPromises = req.files.map(async (file) => {
                try {
                    const result = await uploadFiles(file);
                    await pool.query(
                        "INSERT INTO post_photos (id, post_id, url, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
                        [v4(), id, result.url, now, now]
                    );
                    return { success: true, url: result.url, filePath: file.path };
                } catch (photoError) {
                    return { success: false, error: photoError.message, originalname: file.originalname, filePath: file.path };
                }
            });
            await Promise.all(photoInsertPromises);
        }
 
        const cleanupPromises = filesToCleanup.map(async (filePath) => {
            if (!filePath) return;
            try {
                await fs.unlink(filePath);
            } catch (unlinkError) {
                if (unlinkError.code !== "ENOENT") {
                    console.error("Error al limpiar archivo local después de la actualización:", filePath, unlinkError.message);
                }
            }
        });
        await Promise.all(cleanupPromises);


        return res.status(200).json({ success: true, message: "Post actualizado exitosamente." });

    } catch (error) {
        const cleanupOnFailPromises = filesToCleanup.map(async (filePath) => {
            if (!filePath) return;
            try {
                await fs.unlink(filePath);
            } catch (cleanupError) {
                if (cleanupError.code !== "ENOENT") {
                    console.error("Error durante la limpieza después de fallo en actualización:", filePath, cleanupError.message);
                }
            }
        });
        await Promise.all(cleanupOnFailPromises);

        console.error("Error al actualizar post:", error.message);
        return res.status(500).json({ error: "Error al actualizar post: " + error.message });
    }
};

const deletePost = async (req, res) => {
    const { id } = req.params; 
    const userId = req.user.id;

    try {
        await pool.query('BEGIN');
        const postResult = await pool.query(
            "SELECT user_id FROM posts WHERE id = $1",
            [id]
        );

        if (postResult.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: "Post no encontrado." });
        }

        const postOwnerId = postResult.rows[0].user_id;

        if (userId !== postOwnerId && req.user.role !== 'admin') {
            await pool.query('ROLLBACK');
            return res.status(403).json({ error: "No tienes permiso para eliminar este post." });
        }

        const photosResult = await pool.query(
            "SELECT id, url FROM post_photos WHERE post_id = $1",
            [id]
        );
        const photosToDelete = photosResult.rows;


        const firebaseDeletePromises = photosToDelete.map(async (photo) => {
            try {
                const fileName = getFileNameFromUrl(photo.url);
                if (fileName) {
                    await deleteFileByNamepro(fileName);
                }
                return { success: true, url: photo.url };
            } catch (firebaseError) {
                console.error("Error al eliminar foto de Firebase:", photo.url, firebaseError.message);
                return { success: false, url: photo.url, error: firebaseError.message };
            }
        });
        await Promise.all(firebaseDeletePromises); 

        await pool.query("DELETE FROM post_photos WHERE post_id = $1", [id]);

        const deletePostResult = await pool.query("DELETE FROM posts WHERE id = $1", [id]);

        if (deletePostResult.rowCount === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: "Post no encontrado después de verificar." });
        }

        await pool.query('COMMIT');

        return res.status(200).json({ success: true, message: "Post eliminado exitosamente y sus imágenes asociadas." });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error("Error al eliminar post:", error.message);
        return res.status(500).json({ error: "Error al eliminar post: " + error.message });
    }
};

const getCourts = async (req, res) => {
  try {
    const result = await pool.query(`
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
          COALESCE(json_agg(DISTINCT jsonb_build_object('id', sc.id, 'name', sc.name, 'state', sc.state)) FILTER (WHERE sc.id IS NOT NULL), '[]') AS subcourts,
          COALESCE(json_agg(DISTINCT jsonb_build_object('id', cp.id, 'day_of_week', cp.day_of_week, 'price', cp.price)) FILTER (WHERE cp.id IS NOT NULL), '[]') AS court_prices,
          COALESCE(json_agg(DISTINCT jsonb_build_object('id', cs.id, 'platform', cs.platform, 'url', cs.url)) FILTER (WHERE cs.id IS NOT NULL), '[]') AS court_socials,
          COALESCE(json_agg(DISTINCT jsonb_build_object('id', p.id, 'url', p.url)) FILTER (WHERE p.id IS NOT NULL), '[]') AS photos
      FROM
          courts c
      LEFT JOIN
          users u ON c.user_id = u.id
      LEFT JOIN
          subcourts sc ON c.id = sc.court_id
      LEFT JOIN
          court_prices cp ON c.id = cp.court_id
      LEFT JOIN
          court_socials cs ON c.id = cs.court_id
      LEFT JOIN
          photos p ON c.id = p.court_id
      GROUP BY
          c.id, u.name
      ORDER BY
          c.created_at DESC;
    `);
    res.status(200).json({ success: true, courts: result.rows });
  } catch (error) {
    console.error("Error al obtener canchas:", error.message);
    res.status(500).json({ error: "Error al obtener canchas: " + error.message });
  }
};


const getServices = async (req,res) => {
      const { id } = req.params;

      try {
    const result = await pool.query(`
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
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Cancha no encontrada." });
    }
    res.status(200).json({ success: true, court: result.rows[0] });
  } catch (error) {
    console.error("Error al obtener cancha por ID:", error.message);
    res.status(500).json({ error: "Error al obtener cancha: " + error.message });
  }

}
const getCourtById = async (req, res) => {
  const { id } = req.params; // courtId

  try {
    const result = await pool.query(`
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
          COALESCE(json_agg(DISTINCT jsonb_build_object('id', sc.id, 'name', sc.name, 'state', sc.state)) FILTER (WHERE sc.id IS NOT NULL), '[]') AS subcourts,
          COALESCE(json_agg(DISTINCT jsonb_build_object('id', cp.id, 'day_of_week', cp.day_of_week, 'price', cp.price)) FILTER (WHERE cp.id IS NOT NULL), '[]') AS court_prices,
          COALESCE(json_agg(DISTINCT jsonb_build_object('id', cs.id, 'platform', cs.platform, 'url', cs.url)) FILTER (WHERE cs.id IS NOT NULL), '[]') AS court_socials,
          COALESCE(json_agg(DISTINCT jsonb_build_object('id', p.id, 'url', p.url)) FILTER (WHERE p.id IS NOT NULL), '[]') AS photos
      FROM
          courts c
      LEFT JOIN
          users u ON c.user_id = u.id
      LEFT JOIN
          subcourts sc ON c.id = sc.court_id
      LEFT JOIN
          court_prices cp ON c.id = cp.court_id
      LEFT JOIN
          court_socials cs ON c.id = cs.court_id
      LEFT JOIN
          photos p ON c.id = p.court_id
      WHERE
          c.id = $1
      GROUP BY
          c.id, u.name;
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Cancha no encontrada." });
    }
    res.status(200).json({ success: true, court: result.rows[0] });
  } catch (error) {
    console.error("Error al obtener cancha por ID:", error.message);
    res.status(500).json({ error: "Error al obtener cancha: " + error.message });
  }
};

const updateCourt = async (req, res) => {
  const { id } = req.params;
  const {
    name,
    address,
    city,
    phone,
    court_type,
    is_public,
    price,
    description,
    state,
    subcourts,
    court_prices,
    court_socials
  } = req.body;
  const userId = req.user.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET app.current_user_id = '${userId}';`);

    const courtResult = await client.query(
      "SELECT user_id FROM courts WHERE id = $1",
      [id]
    );

    if (courtResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Cancha no encontrada." });
    }

    const courtOwnerId = courtResult.rows[0].user_id;
    if (userId !== courtOwnerId && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: "No tienes permiso para actualizar esta cancha." });
    }

    const now = new Date();

    await client.query(
      `UPDATE courts SET
        name = COALESCE($1, name),
        address = COALESCE($2, address),
        city = COALESCE($3, city),
        phone = COALESCE($4, phone),
        court_type = COALESCE($5, court_type),
        is_public = COALESCE($6, is_public),
        price = COALESCE($7, price),
        description = COALESCE($8, description),
        state = COALESCE($9, state),
        updated_at = $10
      WHERE id = $11`,
      [name, address, city, phone, court_type, is_public, price, description, state, now, id]
    );

    if (subcourts !== undefined && Array.isArray(subcourts)) {
      for (const subcourt of subcourts) {
        if (subcourt.id) {
          await client.query(
            "UPDATE subcourts SET name = COALESCE($1, name), state = COALESCE($2, state), updated_at = $3 WHERE id = $4 AND court_id = $5",
            [subcourt.name, subcourt.state, now, subcourt.id, id]
          );
        }
      }
    }

    if (court_prices !== undefined && Array.isArray(court_prices)) {
      for (const cp of court_prices) {
        if (cp.id) {
          await client.query(
            "UPDATE court_prices SET day_of_week = COALESCE($1, day_of_week), price = COALESCE($2, price), updated_at = $3 WHERE id = $4 AND court_id = $5",
            [cp.day_of_week, cp.price, now, cp.id, id]
          );
        }
      }
    }

    if (court_socials !== undefined && Array.isArray(court_socials)) {
      for (const cs of court_socials) {
        if (cs.id) {
          await client.query(
            "UPDATE court_socials SET platform = COALESCE($1, platform), url = COALESCE($2, url), updated_at = $3 WHERE id = $4 AND court_id = $5",
            [cs.platform, cs.url, now, cs.id, id]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.status(200).json({ success: true, message: "Cancha y sus datos asociados actualizados exitosamente (solo registros existentes con ID)." });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error al actualizar la cancha:", error.message);
    res.status(500).json({ error: "Error al actualizar la cancha: " + error.message });
  } finally {
    client.release();
  }
};

const deleteCourt = async (req, res) => {
    const { id } = req.params; 
    const userId = req.user.id; 

    const client = await pool.connect();
    try {
        await client.query('BEGIN'); 
        await client.query(`SET app.current_user_id = '${userId}';`);

        const courtResult = await client.query(
            "SELECT user_id FROM courts WHERE id = $1",
            [id]
        );

        if (courtResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Cancha no encontrada." });
        }

        const courtOwnerId = courtResult.rows[0].user_id;
        if (userId !== courtOwnerId && req.user.role !== 'admin') {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: "No tienes permiso para eliminar esta cancha." });
        }

        const photosResult = await client.query(
            "SELECT url FROM photos WHERE id = $1",
            [id]
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
                console.error("Error al eliminar foto de Firebase:", photo.url, firebaseError.message);
                return { success: false, url: photo.url, error: firebaseError.message };
            }
        });
        const firebaseDeletionResults = await Promise.all(firebaseDeletePromises);

        const failedFirebaseDeletions = firebaseDeletionResults.filter(r => !r.success);
        if (failedFirebaseDeletions.length > 0) {
            console.warn("Algunas imágenes no se pudieron eliminar de Firebase Storage:", failedFirebaseDeletions);
        }
        
        // --- ¡NUEVO: ELIMINAR SUBCANCHAS ASOCIADAS PRIMERO! ---
        await client.query("DELETE FROM subcourts WHERE court_id = $1", [id]);

        // Eliminar las fotos de la tabla 'photos' en la base de datos
        await client.query("DELETE FROM photos WHERE court_id = $1", [id]);


        // Eliminar la cancha principal de la tabla 'courts'
        const deleteCourtResult = await client.query("DELETE FROM courts WHERE id = $1", [id]);

        if (deleteCourtResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Cancha no encontrada después de verificar." });
        }

        await client.query('COMMIT'); 
        res.status(200).json({
            success: true,
            message: "Cancha y sus datos asociados eliminados exitosamente.",
            firebase_deletion_summary: failedFirebaseDeletions.length > 0 ? "Algunas imágenes no se eliminaron de Firebase." : "Todas las imágenes asociadas se eliminaron de Firebase.",
            failed_firebase_deletions: failedFirebaseDeletions
        });
    } catch (error) {
        await client.query('ROLLBACK'); 
        console.error("Error al eliminar la cancha:", error.message);
        res.status(500).json({ error: "Error al eliminar la cancha: " + error.message });
    } finally {
        client.release(); 
    }
};

const deleteSubcourt = async (req, res) => {
  const { subcourtId } = req.params;
  const userId = req.user.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET app.current_user_id = '${userId}';`);

    const subcourtResult = await client.query(
      "SELECT court_id FROM subcourts WHERE id = $1",
      [subcourtId]
    );

    if (subcourtResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Subcancha no encontrada." });
    }

    const courtId = subcourtResult.rows[0].court_id;

    const courtOwnerResult = await client.query(
      "SELECT user_id FROM courts WHERE id = $1",
      [courtId]
    );

    const courtOwnerId = courtOwnerResult.rows[0].user_id;
    if (userId !== courtOwnerId && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: "No tienes permiso para eliminar esta subcancha." });
    }

    const deleteResult = await client.query("DELETE FROM subcourts WHERE id = $1", [subcourtId]);

    if (deleteResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Subcancha no encontrada después de verificar." });
    }

    await client.query('COMMIT');
    res.status(200).json({ success: true, message: "Subcancha eliminada exitosamente." });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error al eliminar la subcancha:", error.message);
    res.status(500).json({ error: "Error al eliminar la subcancha: " + error.message });
  } finally {
    client.release();
  }
};

const createReservation = async (req, res) => {
  const { subcourtId } = req.params;
    const {
        client_id, // Usamos client_id en lugar de user_id
        reservation_date,
        reservation_time,
        duration,
        end_time,
        state,
        price_reservation,
        transfer
    } = req.body;

    console.log(req.body)
    try {
        const reservationId = v4();
        const now = new Date();

        const result = await pool.query(
            `INSERT INTO reservations (
                id,
                client_id,
                subcourt_id,
                reservation_date,
                reservation_time,
                duration,
                end_time,
                state,
                price_reservation,
                transfer,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id, subcourt_id, reservation_date, reservation_time`,
            [
                reservationId,
                client_id,
                subcourtId,
                reservation_date,
                reservation_time,
                duration,
                end_time,
                state,
                price_reservation,
                transfer,
                now,
                now
            ]
        );

        res.status(201).json({
            success: true,
            message: "Reserva creada exitosamente.",
            reservation: result.rows[0]
        });

    } catch (error) {
        console.error("Error al crear la reserva:", error.message);
        if (error.code === '23503') {
            return res.status(400).json({
                error: "El subcourt_id o client_id proporcionado no existe."
            });
        }
        res.status(500).json({
            error: "Error interno del servidor al crear la reserva.",
            details: error.message
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
  createPost,
  getPosts,
  getPostById,    
  updatePost,     
  deletePost,
  getCourts,
  getCourtById,
  updateCourt,
  deleteCourt,
  deleteSubcourt,
  createReservation,
  logout,
  getServices,
  registerServices
};
