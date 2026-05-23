const s=require('sqlite3').verbose();
const db=new s.Database('./database.sqlite',s.OPEN_READONLY,()=>{
  db.all("PRAGMA table_info('DisbursedLoans')", (e,r)=>{
    console.log('DisbursedLoans columns:', r.map(c=>c.name).join(', '));
    db.close();
  });
});
