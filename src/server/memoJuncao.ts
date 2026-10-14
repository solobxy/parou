// Guarda durante alguns segundos o resultado de um cálculo pesado e junta pedidos iguais que chegam ao mesmo tempo:
// se dez pedidos iguais chegam juntos (duplo toque, atualizar, vários separadores), o cálculo corre uma vez e todos recebem o mesmo.
// Os erros não ficam guardados: o pedido seguinte volta a tentar.
export function memoComJuncao<T>(opcoes: { max: number; validadeMs: number }) {
  const guardados = new Map<string, { quando: number; valor: T }>();
  const emCurso = new Map<string, Promise<T>>();
  return function obter(chave: string, calcular: () => Promise<T>): Promise<T> {
    const agora = Date.now();
    const g = guardados.get(chave);
    if (g) {
      if (agora - g.quando < opcoes.validadeMs) return Promise.resolve(g.valor);
      guardados.delete(chave);
    }
    const a = emCurso.get(chave);
    if (a) return a;
    const p = (async () => calcular())()
      .then((valor) => {
        guardados.set(chave, { quando: Date.now(), valor });
        while (guardados.size > opcoes.max) {
          const maisAntiga = guardados.keys().next().value;
          if (maisAntiga === undefined) break;
          guardados.delete(maisAntiga);
        }
        return valor;
      })
      .finally(() => { emCurso.delete(chave); });
    emCurso.set(chave, p);
    return p;
  };
}
