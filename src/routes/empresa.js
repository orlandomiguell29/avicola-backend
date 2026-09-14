import { Router } from 'express';
import { get, update } from '../controllers/empresa.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
const r = Router();
r.get('/', requireAuth, get);
r.put('/', requireAuth, requireAdmin, update);
export default r;
