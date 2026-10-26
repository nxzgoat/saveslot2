import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Endereço base do site (funciona na raiz e em subpasta, como no GitHub Pages)
export const siteUrl = window.location.origin + import.meta.env.BASE_URL;

export const configured = Boolean(url && key);

// Só a chave anon/publishable vai para o navegador; a segurança vem das políticas RLS.
export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-key');
