// Fontes governamentais e oficiais que a PAROU mostra, com o link para a fonte original, e o aviso de que a PAROU
// não é uma entidade governamental. A Google Play pede as duas coisas (política de declarações enganosas).

export const FONTES_OFICIAIS: ReadonlyArray<{ nome: string; url: string }> = [
  { nome: 'ANEPC (Proteção Civil)', url: 'https://prociv.gov.pt' },
  { nome: 'IPMA (tempo)', url: 'https://www.ipma.pt' },
  { nome: 'Fogos.pt (incêndios, dados da ANEPC)', url: 'https://fogos.pt' },
];

export const AVISO_NAO_GOVERNAMENTAL =
  'A PAROU não é uma entidade governamental nem um serviço oficial da Proteção Civil, do IPMA ou dos operadores de transportes. ' +
  'Os dados vêm das fontes indicadas acima. Em emergência, liga 112.';
