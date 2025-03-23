import pkg from 'pg';

const { Pool } = pkg;

const { PGHOST,PGDATABASE,PGUSER,PGPASSWORD}=process.env;

const pool=new Pool({
    host:PGHOST,
    database:PGDATABASE,
    username:PGUSER,
    password:PGPASSWORD,
    port:5432,
    ssl:{
        require:true,
    }
})

export default pool;