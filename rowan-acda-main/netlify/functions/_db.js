import { neon } from '@neondatabase/serverless';

export function sqlClient(){
  const url = process.env.NEON_DATABASE_URL;
  if(!url) throw new Error('Missing NEON_DATABASE_URL');
  return neon(url);
}
