const admin = require("firebase-admin");
const serviceAccount = require("./credentials.json");
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const sharp = require('sharp');  // Agregado sharp
const { parse } = require('url');

const firebaseConfig = {
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "gs://tattoproyect",  // Reemplaza con tu nombre de bucket
};

admin.initializeApp(firebaseConfig);
const storage = admin.storage();
const bucket = storage.bucket(firebaseConfig.storageBucket);

const uploadFiles = async (file) => {
  try {
    const uniqueFilename = `${uuidv4()}${path.extname(file.originalname)}`;

    // Crear una referencia al archivo en Firebase Storage con el nombre único
    const storageRef = bucket.file(uniqueFilename);
    
    const aspectRatio = 4 / 3; 

    // Redimensionar la imagen usando sharp antes de subirla
    const resizedBuffer = await sharp(file.path)
    .rotate() // Rotar la imagen según los metadatos EXIF
    .toBuffer();
    // Crear un flujo de escritura para cargar el archivo redimensionado en Storage
    const writeStream = storageRef.createWriteStream({
      metadata: {
        contentType: file.mimetype,
      },
    });

    // Pipe (redirigir) el flujo de lectura al flujo de escritura
    const readableStream = require('stream').Readable.from(resizedBuffer);
    readableStream.pipe(writeStream);

    // Manejar eventos de finalización y errores
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    console.log('Archivo subido con éxito:', uniqueFilename);

    // Obtener la URL del archivo
    const [url] = await storageRef.getSignedUrl({
      action: 'read',
      expires: '01-01-2030', // Definir una fecha de caducidad
    });

    return {
      uniqueFilename,
      url: url,
      expires: '01-01-2030',
    };
  } catch (error) {
    console.error("Error al subir el archivo a Firebase Storage:", error);
    throw error;
  }
};

const deleteFileByName = async (filename) => {
  try {
    // Crear una referencia al archivo en Firebase Storage
    const fileRef = bucket.file(filename);

    // Eliminar el archivo
    await fileRef.delete();

    console.log(`Archivo eliminado con éxito: ${filename}`);
  } catch (error) {
    console.error(`Error al eliminar el archivo ${filename}:`, error);
    throw error;
  }
};
const deleteFileByNamepro = async (filename) => {
  try {
    await bucket.file(filename).delete();
    console.log(`Archivo eliminado con éxito: ${filename}`);
  } catch (error) {
    console.error('Error al eliminar el archivo:', error);
    throw error;
  }
};


const getFileNameFromUrl = (imageUrl) => {
  try {
    const parsedUrl = parse(imageUrl);
    const pathSegments = parsedUrl.pathname.split('/');
    const filename = pathSegments[pathSegments.length - 1];
    return filename;
  } catch (error) {
    console.error('Error al obtener el nombre del archivo desde la URL:', error);
    throw error;
  }
};

module.exports = {
  uploadFiles,
  deleteFileByName,
  deleteFileByNamepro,
  getFileNameFromUrl
};

