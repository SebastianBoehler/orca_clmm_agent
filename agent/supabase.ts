import { createClient } from "@supabase/supabase-js";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase credentials in environment variables");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const savePositions = async (positions: any[]) => {
  const { data, error } = await supabase.from("positions").insert(positions).select();
  if (error) throw error;
  console.log("Positions saved", data, error);
  return data;
};

export const getPositionByAddress = async (address: string) => {
  const { data, error } = await supabase.from("positions").select().eq("address", address);
  if (error) throw error;
  return data;
};

export const updatePosition = async (address: string, newData: any) => {
  const { data, error } = await supabase.from("positions").update(newData).eq("address", address);
  if (error) throw error;
  return data;
};
