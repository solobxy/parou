import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  /** Texto "oficial" (muda quando a app o escolhe, por exemplo ao escolher uma sugestão ou limpar) */
  valor: string;
  /** Chamado só depois de a pessoa parar de escrever um instante */
  onTexto: (v: string) => void;
  onLimpar?: () => void;
  placeholder: string;
  className: string;
  classeLimpar?: string;
  rotuloLimpar?: string;
  autoFocus?: boolean;
  onFocus?: () => void;
}

/**
 * Caixa de pesquisa fluida: o que se escreve fica num estado só desta caixa, por isso cada letra
 * redesenha apenas o campo (e não o ecrã inteiro com o mapa e as listas). A pesquisa só é pedida
 * à app quando se pára de escrever.
 */
export const InputPesquisa = React.memo(function InputPesquisa({
  valor, onTexto, onLimpar, placeholder, className, classeLimpar, rotuloLimpar, autoFocus, onFocus,
}: Props) {
  const [txt, setTxt] = useState(valor);
  const ultimo = useRef(valor);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A app mudou o texto (escolheu uma sugestão, limpou…): acompanha e cancela o que estava por enviar
  useEffect(() => {
    if (valor !== ultimo.current) {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      ultimo.current = valor;
      setTxt(valor);
    }
  }, [valor]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const mudar = (v: string) => {
    setTxt(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      ultimo.current = v;
      onTexto(v);
    }, 180);
  };

  const limpar = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    ultimo.current = '';
    setTxt('');
    onLimpar?.();
  };

  return (
    <>
      <input
        type="text"
        value={txt}
        onChange={(e) => mudar(e.target.value)}
        onFocus={onFocus}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={className}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {txt && onLimpar && (
        <button onClick={limpar} className={classeLimpar} aria-label={rotuloLimpar}>
          <X className="w-3.5 h-3.5 stroke-[2]" />
        </button>
      )}
    </>
  );
});
