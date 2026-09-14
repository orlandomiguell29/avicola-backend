import {Router} from 'express';
import {list} from '../controllers/auditoria.js';
import {requireAuth,requireAdmin} from '../middleware/auth.js';
const r=Router();
r.get('/',requireAuth,requireAdmin,list);
export default r;
