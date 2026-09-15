import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import routes from './routes/index.js';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 1. Permitir que Express confíe en el proxy de Render para express-rate-limit
app.set('trust proxy', 1);

// Headers HTTP seguros
app.use(helmet({ contentSecurityPolicy: false }));

// Configuración flexible de CORS para Vercel y desarrollo local
const allowedOrigins = [
  'https://avicola-frontend-sigma.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    return callback(new Error('Bloqueado por política de CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limit login: máx 10 intentos por IP cada 15 min
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de acceso. Espera 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
}));

// Rate limit general: máx 300 req/min por IP
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: 'Demasiadas solicitudes.' },
}));

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', routes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => console.log(`✅ Servidor corriendo en puerto ${PORT}`));
