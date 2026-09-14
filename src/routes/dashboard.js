import {Router} from 'express';
import {getDashboard} from '../controllers/dashboard.js';
import {requireAuth} from '../middleware/auth.js';
const r=Router();
r.get('/',requireAuth,getDashboard);
export default r;
