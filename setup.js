export const SUPABASE_URL = "https://exqaziqinrxrvowfhnst.supabase.co"; // REPLACE
export const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4cWF6aXFpbnJ4cnZvd2ZobnN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTU3MTI2MywiZXhwIjoyMDc1MTQ3MjYzfQ.sU4Ul2YshW5Q378cB17rDc2fHUjd8szvA0mhInV-k9E"; // REPLACE

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);