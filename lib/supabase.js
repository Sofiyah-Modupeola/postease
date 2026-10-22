import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase;
if (!url || !key) {
  console.log("Missing Supabase env");
  supabase = null;
} else {
  supabase = createClient(url, key);
}

export default supabase;
export { supabase };
