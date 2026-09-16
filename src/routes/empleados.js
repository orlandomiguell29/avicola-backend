import { Router } from 'express';
import { list, listActivos, create, update, remove } from '../controllers/empleados.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const r = Router();

r.use(requireAuth);

// ¡Importante! La ruta específica '/activos' debe ir SIEMPRE antes de la ruta raíz '/'
r.get('/activos', listActivos);
r.get('/', list);
r.post('/', create);
r.put('/:id', requirePermission('edit'), update);
r.delete('/:id', requirePermission('delete'), remove);

export default r;
