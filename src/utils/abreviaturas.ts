/**
 * Abreviaturas que alguns operadores escrevem em maiúsculas no meio de nomes normais
 * (sobretudo os Horários do Funchal: "CAM Trapiche  D2A (750B)", "Centro - LEV STA Luzia").
 * Só mexe em nomes que já trazem minúsculas: nos nomes todos em maiúsculas não dá para
 * distinguir uma abreviatura de uma palavra, e esses ficam como estavam.
 */

const POR_EXTENSO: Record<string, string> = {
  AV: 'Avenida', CAM: 'Caminho', CEM: 'Cemitério', CMDT: 'Comandante', COR: 'Coronel', CZ: 'Cruzamento',
  DR: 'Dr.', EDF: 'Edifício', ENG: 'Eng.', ENT: 'Entrada', ESCL: 'Escola', ESTR: 'Estrada', JRD: 'Jardim',
  LEV: 'Levada', LG: 'Largo', LMB: 'Lombo', PALH: 'Palheiro', PAV: 'Pavilhão', PQ: 'Parque', QTA: 'Quinta',
  RIB: 'Ribeira', ROT: 'Rotunda', STA: 'Santa', STO: 'Santo', TRAV: 'Travessa', TV: 'Travessa', VER: 'Vereda',
  VISC: 'Visconde', ZN: 'Zona',
};

// "S Martinho" -> "São Martinho"; "S Luzia" -> "Santa Luzia"; "S António" -> "Santo António"
const SANTAS = new Set(['Ana', 'Bárbara', 'Catarina', 'Clara', 'Comba', 'Cristina', 'Cruz', 'Engrácia', 'Eufémia', 'Eulália',
  'Helena', 'Iria', 'Isabel', 'Joana', 'Leocádia', 'Luzia', 'Madalena', 'Margarida', 'Maria', 'Marinha', 'Marta',
  'Quitéria', 'Rita', 'Sofia', 'Susana', 'Teresa', 'Apolónia']);

function santo(nome: string): string {
  if (SANTAS.has(nome)) return 'Santa';
  if (nome === 'Tirso' || /^[AEIOUÁÉÍÓÚÂÊÔ]/.test(nome)) return 'Santo';
  return 'São';
}

// Código de posição dos Horários do Funchal antes do número da paragem: "D", "S", "S1A", "D2", "1A"
const CODIGO_POSICAO = /\s+(?:[DS]\d{0,2}[AB]?|\d[AB])\s*(\((?:CF)?\d+[A-Z]{0,2}\))\s*$/;

export function expandirAbreviaturas(nome: string): string {
  let s = String(nome || '').replace(/\s+/g, ' ').trim();
  if (!s || !/[a-zà-ÿ]/.test(s)) return s;
  s = s.replace(CODIGO_POSICAO, ' $1');
  // Sem lookbehind: os iPhones com iOS antes do 16.4 não o conhecem e a app inteira deixava de abrir
  s = s.replace(/(^|\s)ENG Velho\b/g, '$1Engenho Velho');
  s = s.replace(/(^|[\s(\-–/])([A-Z]{2,4})(?=$|[\s)\-–/,;:])/g, (m, antes: string, sigla: string) => (POR_EXTENSO[sigla] ? antes + POR_EXTENSO[sigla] : m));
  // "EB23/S" não é um santo: só depois de espaço, parêntese ou hífen
  s = s.replace(/(^|[\s(\-–])S ([A-ZÀ-Ý][a-zà-ÿ]+)/g, (_m, antes: string, n: string) => `${antes}${santo(n)} ${n}`);
  // Palavras coladas dos Horários do Funchal
  s = s.replace(/\bCFreiras\b/g, 'Curral das Freiras').replace(/\bC ?Saúde\b/g, 'Centro de Saúde')
    .replace(/\bCAMVirtudes\b/g, 'Caminho Virtudes').replace(/\bMadShopping\b/g, 'Madeira Shopping');
  // "R 31 Janeiro" -> "Rua 31 Janeiro" (só no início, onde "R" é sempre rua)
  s = s.replace(/^R (?=[A-ZÀ-Ý0-9])/, 'Rua ');
  return s;
}
