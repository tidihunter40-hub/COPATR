export function GET() {
  const config = {
    url: process.env.TR_SUPABASE_URL || '',
    anonKey: process.env.TR_SUPABASE_ANON_KEY || '',
  };
  return new Response(`export const supabaseConfig = Object.freeze(${JSON.stringify(config)});`, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
