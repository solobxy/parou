// Novidades da app já escritas, com imagem, para o canal do WhatsApp (painel "Para o WhatsApp" › Novidades)
// e para a Comunidade.
//
// Como se acrescenta uma novidade (sempre que sai algo que as pessoas vejam):
//   1. Entrada nova aqui, com texto curto e pronto a colar. Formato do WhatsApp: *negrito* e _itálico_.
//   2. Imagem (ou imagens) a condizer, em public/novidades/<id>-1.jpg, 1080×1080, mesmo estilo dos outros cartazes.
//   3. Se for das mais úteis ou das mais giras, escreve-se também o texto `comunidade` (curto): o servidor
//      publica-o sozinho na Comunidade, pela conta do Criador, uma única vez e com intervalo entre posts.
// O que já foi publicado no WhatsApp fica marcado no telemóvel do administrador e deixa de aparecer.

export interface NovidadeCanal {
  /** Fixo: é com ele que o painel lembra o que já foi publicado (nunca mudar nem reutilizar) */
  id: string;
  /** Dia em que a novidade saiu na app (aaaa-mm-dd) */
  data: string;
  /** Etiqueta no painel */
  etiqueta: string;
  titulo: string;
  /** Texto final, como vai para o canal do WhatsApp */
  texto: string;
  /** Imagens a condizer (caminhos em /novidades/…), quadradas 1080×1080 */
  imagens?: string[];
  /**
   * Texto curto (uma ou duas frases) para a Comunidade. Se existir, o servidor publica a novidade sozinho,
   * num post só dela, pela conta do Criador, uma única vez. Só as mais úteis ou mais giras levam este texto.
   */
  comunidade?: string;
}

export const NOVIDADES: NovidadeCanal[] = [
  {
    id: 'boas-vindas',
    data: '2026-10-10',
    etiqueta: 'Primeiro post',
    titulo: 'Boas-vindas ao canal',
    texto: `👋 *Bem-vindo ao canal da PAROU*

A PAROU é a app de transportes públicos de Portugal. É gratuita e sem fins lucrativos.

Aqui vais receber:
🚨 greves e perturbações que mudam a tua viagem
🆕 novidades da app
💡 dicas para poupares tempo

Experimenta: vê os próximos autocarros, metro e comboios perto de ti, em tempo real.

parou.pt`,
    imagens: ['/novidades/boas-vindas-1.jpg'],
  },
  {
    id: 'planeador',
    data: '2026-10-10',
    etiqueta: 'Novidade',
    titulo: 'Planeia a viagem e sai a horas',
    texto: `🧭 *Planeia a viagem e sai a horas*

Escreve para onde vais e a PAROU encontra o caminho, com até 3 transbordos e a parte a pé incluída.

Carrega em *Avisar-me antes de sair de casa* e recebes uma notificação na hora certa, mesmo com a app fechada.

parou.pt`,
    imagens: ['/novidades/planeador-1.jpg'],
    comunidade: 'Escreve para onde vais e a PAROU encontra o caminho. E avisa-te quando deves sair de casa, mesmo com a app fechada.',
  },
  {
    id: 'comunidade',
    data: '2026-10-10',
    etiqueta: 'Novidade',
    titulo: 'Já há Comunidade',
    texto: `💬 *Já há Comunidade na PAROU*

Pergunta como está a tua linha, avisa do que está mal e agradece a quem ajudou. Sem anúncios.

Participar dá reputação, e a reputação desbloqueia personagens, fundos e medalhas para o teu avatar.

🏅 Quem criar conta até 31/12/2026 fica com a medalha *Pioneiro*.

parou.pt/comunidade`,
    imagens: ['/novidades/comunidade-1.jpg'],
  },
  {
    id: 'avatar',
    data: '2026-10-10',
    etiqueta: 'Novidade',
    titulo: 'Cria o teu avatar',
    texto: `🎨 *Cria o teu avatar*

Escolhe entre 7 personagens (Paro, Estrela, Gato, Cato, Camaleão, Autocarro e Paragem) e veste-a com chapéus, óculos, roupas e objetos. Há 18 fundos para o teu ícone.

Umas peças são livres; as outras abrem com reputação.

parou.pt/comunidade`,
    imagens: ['/novidades/avatar-1.jpg', '/novidades/avatar-2.jpg'],
    comunidade: '7 personagens, chapéus, roupas, objetos e 18 fundos para fazeres o teu avatar. Aparece nos teus comentários.',
  },
  {
    id: 'medalhas',
    data: '2026-10-10',
    etiqueta: 'Novidade',
    titulo: 'Chegaram as medalhas',
    texto: `🏅 *Chegaram as medalhas*

São só para quem ganha reputação: coração e laço aos 50 pontos, estrela e trevo aos 75, roseta e escudo aos 100, diamante e medalha de ouro aos 200.

Aparecem junto ao teu avatar nos comentários.

parou.pt/comunidade`,
    imagens: ['/novidades/medalhas-1.jpg', '/novidades/medalhas-2.jpg'],
    comunidade: 'Coração, laço, estrela, trevo, roseta, escudo, diamante e ouro. Ganham-se com reputação e aparecem junto ao teu avatar.',
  },
  {
    id: 'alertas-noticias',
    data: '2026-10-10',
    etiqueta: 'Novidade',
    titulo: 'Alertas e Notícias',
    texto: `🗺️ *Alertas e Notícias*

*Alertas* mostra no mapa o que está a afetar os transportes agora: avisos da Carris Metropolitana, Metro de Lisboa, incêndios e sismos.

Em *Notícias* tens greves, tempo, trânsito e feriados.

parou.pt/alertas`,
    imagens: ['/novidades/alertas-noticias-1.jpg'],
    comunidade: 'Vê no mapa o que está a afetar os transportes agora e, em Notícias, greves, tempo e trânsito.',
  },
  {
    id: 'perto-fluido',
    data: '2026-10-10',
    etiqueta: 'Novidade',
    titulo: 'Perto de ti, mais fluido e preciso',
    texto: `📍 *Perto de ti, mais fluido e mais preciso*

O mapa ficou mais leve e a tua posição deixou de "tremer". Quando o sinal de GPS está fraco, vês um círculo com a margem de erro, e as distâncias às paragens atualizam enquanto andas.

parou.pt`,
    imagens: ['/novidades/perto-fluido-1.jpg'],
  },
  {
    id: 'ingles',
    data: '2026-10-10',
    etiqueta: 'Novidade',
    titulo: 'PAROU também em inglês',
    texto: `🌍 *A PAROU também fala inglês*

Toca em *EN* no topo e a app muda para inglês. Útil para quem visita Portugal.

parou.pt`,
    imagens: ['/novidades/ingles-1.jpg'],
  },
  {
    id: 'temas',
    data: '2026-10-11',
    etiqueta: 'Novidade',
    titulo: 'Escolhe o teu tema',
    texto: `🎨 *Escolhe o teu tema*

Toca no ícone da paleta, no topo da app:
⚪ *Claro*, o de sempre
🌙 *Escuro*, para descansar a vista à noite
🟠 *Âmbar*, mais laranja, em vidro

A tua escolha fica guardada.

parou.pt`,
    imagens: ['/novidades/temas-1.jpg'],
    comunidade: 'Já podes escolher o tema da app: Claro, Escuro (para a noite) ou Âmbar, mais laranja e em vidro. Toca na paleta, no topo.',
  },
  {
    id: 'recuperar-palavra-passe',
    data: '2026-10-11',
    etiqueta: 'Novidade',
    titulo: 'Recupera a palavra-passe por email',
    texto: `🔑 *Esqueceste-te da palavra-passe?*

Já podes recuperá-la por email: toca em _"Esqueci-me da palavra-passe"_, abre o link que recebes e escolhe uma nova. O link vale 1 hora.

Dúvidas? contacto@parou.pt

parou.pt`,
    imagens: ['/novidades/recuperar-1.jpg'],
    comunidade: 'Esqueceste-te da palavra-passe? Já podes recuperá-la por email: toca em "Esqueci-me da palavra-passe" ao entrar e abre o link que recebes.',
  },
  {
    id: 'conforto',
    data: '2026-10-11',
    etiqueta: 'Novidade',
    titulo: 'Mais rápida no telemóvel',
    texto: `📱 *Mais rápida no telemóvel*

Três detalhes que poupam toques:
↩️ O gesto de voltar do telemóvel fecha a janela que tens aberta, sem procurares o X
⭐ Em Horários, as tuas linhas favoritas vêm primeiro
🔔 Em Alertas, tens o botão para te juntares a este canal

parou.pt`,
    imagens: ['/novidades/conforto-1.jpg'],
    comunidade: 'Mais três detalhes no telemóvel: o gesto de voltar fecha a janela que tens aberta, em Horários as tuas linhas favoritas vêm primeiro e, em Alertas, já tens o botão para te juntares ao canal de WhatsApp.',
  },
];
