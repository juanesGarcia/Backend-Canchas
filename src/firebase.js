const admin = require("firebase-admin");
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const sharp = require('sharp');
const { parse } = require('url');

/**
 * Configuración de Firebase Admin usando variables de entorno para Railway.
 * Esto evita el error de "file not found" con credentials.json.
 */
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  // Reemplazamos los saltos de línea literales para que la llave sea válida
  privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
};

const firebaseConfig = {
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "tattoproyect.appspot.com", // El ID de tu proyecto usualmente termina en .appspot.com para storage
};

// Inicialización segura de Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp(firebaseConfig);
  console.log("✅ Firebase Admin & Storage inicializado correctamente");
}

const bucket = admin.storage().bucket(firebaseConfig.storageBucket);

/**
 * Sube un archivo a Firebase Storage procesándolo con Sharp
 */
const uploadFiles = async (file) => {
  try {
    const uniqueFilename = `${uuidv4()}${path.extname(file.originalname)}`;
    const storageRef = bucket.file(uniqueFilename);

    // Procesar la imagen con Sharp (Redimensión y rotación automática EXIF)
    // Usamos el buffer del archivo subido por multer
    const resizedBuffer = await sharp(file.path)
      .rotate()
      .toBuffer();

    const writeStream = storageRef.createWriteStream({
      metadata: {
        contentType: file.mimetype,
      },
    });

    const readableStream = require('stream').Readable.from(resizedBuffer);
    readableStream.pipe(writeStream);

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    console.log('🚀 Archivo subido con éxito:', uniqueFilename);

    // Obtener la URL pública (firmada)
    const [url] = await storageRef.getSignedUrl({
      action: 'read',
      expires: '01-01-2030',
    });

    return {
      uniqueFilename,
      url: url,
      expires: '01-01-2030',
    };
  } catch (error) {
    console.error("❌ Error al subir el archivo a Firebase Storage:", error);
    throw error;
  }
};

/**
 * Elimina un archivo por su nombre único
 */
const deleteFileByName = async (filename) => {
  try {
    const fileRef = bucket.file(filename);
    await fileRef.delete();
    console.log(`🗑️ Archivo eliminado con éxito: ${filename}`);
  } catch (error) {
    console.error(`❌ Error al eliminar el archivo ${filename}:`, error);
    throw error;
  }
};

const deleteFileByNamepro = async (filename) => {
  try {
    await bucket.file(filename).delete();
    console.log(`🗑️ Archivo eliminado con éxito: ${filename}`);
  } catch (error) {
    console.error('❌ Error al eliminar el archivo:', error);
    throw error;
  }
};

/**
 * Extrae el nombre del archivo de una URL de Firebase
 */
const getFileNameFromUrl = (imageUrl) => {
  try {
    const parsedUrl = parse(imageUrl);
    const pathSegments = parsedUrl.pathname.split('/');
    const filename = pathSegments[pathSegments.length - 1];
    return filename;
  } catch (error) {
    console.error('❌ Error al obtener el nombre del archivo desde la URL:', error);
    throw error;
  }
};

module.exports = {
  uploadFiles,
  deleteFileByName,
  deleteFileByNamepro,
  getFileNameFromUrl
};