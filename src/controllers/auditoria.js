import {query,paginate} from '../db.js';
export async function list(req,res){
  try{
    const{page=1,tabla=''}=req.query;
    const{limit,offset,page:p,perPage}=paginate(page,30);
    let where='1=1';const params=[];
    if(tabla){where+=` AND tabla_afectada=?`;params.push(tabla);}
    const[[{total}],rows]=await Promise.all([
      query(`SELECT COUNT(*) total FROM audit_logs WHERE ${where}`,params),
      query(`SELECT al.*,u.name usuario_name FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id WHERE ${where} ORDER BY al.id DESC LIMIT ? OFFSET ?`,[...params,limit,offset]),
    ]);
    res.json({data:rows,total:Number(total),page:p,pages:Math.ceil(Number(total)/perPage),perPage});
  }catch(e){res.status(500).json({error:e.message});}
}
