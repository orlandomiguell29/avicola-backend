import {Router} from 'express';
import {completo} from '../controllers/export.js';
import {requireAuth,requirePermission} from '../middleware/auth.js';
const r=Router();
r.get('/completo',requireAuth,requirePermission('export'),completo);
export default r;
