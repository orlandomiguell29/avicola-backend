import {Router} from 'express';
import {get,update} from '../controllers/settings.js';
import {requireAuth,requireAdmin} from '../middleware/auth.js';
const r=Router();
r.use(requireAuth);
r.get('/',get);
r.put('/',requireAdmin,update);
export default r;
