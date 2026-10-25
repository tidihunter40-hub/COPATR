import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function GET(request) {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some(key => /^(?:email|e-mail|password|senha|passwd)$/i.test(key))) {
    const requestedReturn = url.searchParams.get('retorno');
    const safeReturn = requestedReturn && (/^\/painel(?:\/|$)/.test(requestedReturn) || requestedReturn === '/minha-conta')
      ? `?retorno=${encodeURIComponent(requestedReturn)}` : '';
    return new Response(null, {
      status: 303,
      headers: { Location: `/entrar${safeReturn}`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    });
  }
  const html = await readFile(resolve(process.cwd(), 'dist/index.html'));
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}
