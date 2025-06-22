const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: '2018214019',
  port: 5432,
});

pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error al conectar con la base de datos:', err.stack);
  }
  console.log('Conexión exitosa a PostgreSQL en Docker!');
  client.release();
});

module.exports = pool;