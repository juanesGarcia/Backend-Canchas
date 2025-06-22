const express = require('express');
const app = express();
const PUERTO = 3000;

app.get('/', (req, res) => {
  res.send('¡Hola, mundo desde Express de');
});

app.listen(PUERTO, () => {
  console.log(`Servidor escuchando en el puerto http://localhost:${PUERTO}`);
});