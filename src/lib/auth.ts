import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export type UserRole = 'comercial' | 'supervisor';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
}

function validRole(value: unknown): UserRole {
  return value === 'supervisor' ? 'supervisor' : 'comercial';
}

async function toAuthUser(user: User): Promise<AuthUser> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, role')
    .eq('id', user.id)
    .single();

  if (error) throw new Error(`No se pudo leer el perfil: ${error.message}`);

  return {
    id: user.id,
    username: data.display_name || user.email || 'usuario',
    role: validRole(data.role),
  };
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const { data, error } = await getSupabaseBrowserClient().auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error || !data.user) {
    throw new Error(error?.message || 'Usuario o contraseña incorrectos.');
  }

  return toAuthUser(data.user);
}

export async function logout(): Promise<void> {
  const { error } = await getSupabaseBrowserClient().auth.signOut();
  if (error) throw new Error(error.message);
}

export async function getSession(): Promise<AuthUser | null> {
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  if (error) throw new Error(error.message);
  return data.session?.user ? toAuthUser(data.session.user) : null;
}

export function getAllowedTabs(role: UserRole): string[] {
  if (role === 'supervisor') {
    // Only expose screens whose operational readers already use Supabase.
    // The remaining legacy screens still bundle JSON/Excel data and must stay
    // inaccessible until their repositories are migrated.
    return ['dashboard', 'depositos', 'exportaciones', 'importar'];
  }
  return ['dashboard'];
}

export function getRoleLabel(role: UserRole): string {
  return role === 'supervisor' ? 'Supervisor' : 'Comercial';
}

export function onAuthChange(callback: (user: AuthUser | null) => void): () => void {
  const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((_event, session) => {
    if (!session?.user) {
      callback(null);
      return;
    }
    void toAuthUser(session.user).then(callback).catch(() => callback(null));
  });
  return () => data.subscription.unsubscribe();
}
