// Modo de administração (só para o Dinis): abre-se uma vez com parou.pt/?admin=CHAVE e a chave
// fica guardada neste browser. Sem ela, os botões de manutenção (reimportar dados, sincronizar
// fontes, testar feeds, moderação) não aparecem e o servidor recusa esses pedidos.
const CHAVE = 'parou_admin';

export function lerChaveAdmin(): string {
  try {
    const url = new URL(window.location.href);
    const nova = url.searchParams.get('admin');
    if (nova !== null) {
      if (nova === 'sair') localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, nova);
      url.searchParams.delete('admin');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
    return localStorage.getItem(CHAVE) || '';
  } catch {
    return '';
  }
}

export function eAdmin(): boolean {
  return lerChaveAdmin().length >= 16;
}

export function cabecalhosAdmin(): Record<string, string> {
  const c = lerChaveAdmin();
  return c ? { 'x-parou-admin': c } : {};
}
