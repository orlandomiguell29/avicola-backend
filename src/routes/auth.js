import {Router} from 'express';
import {login,logout,me,cambiarPassword} from '../controllers/auth.js';
import {requireAuth} from '../middleware/auth.js';
const r=Router();
r.post('/login',login);
r.post('/logout',requireAuth,logout);
r.get('/me',requireAuth,me);
r.put('/password',requireAuth,cambiarPassword);
export default r;
