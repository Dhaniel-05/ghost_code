// @@paso: Importar Express
import express from 'express';

// @@paso: Crear la aplicación
const app = express();
app.use(express.json());

// @@paso: Ruta de salud
app.get('/salud', (_req, res) => {
  res.json({ ok: true, mensaje: 'Hola desde Ghost Code' });
});

// @@paso: Arrancar el servidor
const PUERTO = Number(process.env.PORT) || 3000;
app.listen(PUERTO, () => {
  console.log(`Servidor en http://localhost:${PUERTO}`);
});
