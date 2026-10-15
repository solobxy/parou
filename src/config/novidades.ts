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

Participar dá pontos, e os pontos desbloqueiam personagens, fundos e medalhas para o teu avatar.

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

Umas peças são livres; as outras abrem com pontos.

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

São só para quem ganha pontos: coração e laço aos 50 pontos, estrela e trevo aos 75, roseta e escudo aos 100, diamante e medalha de ouro aos 200.

Aparecem junto ao teu avatar nos comentários.

parou.pt/comunidade`,
    imagens: ['/novidades/medalhas-1.jpg', '/novidades/medalhas-2.jpg'],
    comunidade: 'Coração, laço, estrela, trevo, roseta, escudo, diamante e ouro. Ganham-se com pontos e aparecem junto ao teu avatar.',
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

Toca na bandeira no topo e a app muda para inglês. Útil para quem visita Portugal.

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
  {
    id: 'stcp-tempo-real',
    data: '2026-10-12',
    etiqueta: 'Novidade',
    titulo: 'STCP em tempo real, com os dados oficiais',
    texto: `🚌 *STCP em tempo real*

No Porto, a PAROU passa a usar os dados oficiais da STCP:
⏱️ Quando chega o próximo autocarro, atualizado a cada poucos segundos
📍 Onde vai cada autocarro, no mapa
🟢 O que vem mesmo em direto fica assinalado

Um obrigado à STCP por ter partilhado os dados.
_Dados abertos da STCP, licença CC BY 4.0._

parou.pt`,
    imagens: ['/novidades/stcp-tempo-real-1.jpg'],
    comunidade: 'No Porto, os autocarros da STCP passam a aparecer na PAROU com os dados oficiais da STCP: próximas chegadas atualizadas a cada poucos segundos e a posição de cada autocarro no mapa. Um obrigado à STCP por ter partilhado os dados.',
  },
  {
    id: 'varios-destinos',
    data: '2026-10-12',
    etiqueta: 'Novidade',
    titulo: 'Rota com vários destinos',
    texto: `🗺️ *Várias paragens na mesma viagem*

Vais a casa de um amigo e depois a outro sítio? Agora a rota pode ter até 5 paragens:
➕ Toca no "+" ao lado da pesquisa e escreve cada paragem
↕️ Arrasta para mudar a ordem
⏱️ Diz quanto tempo ficas em cada sítio e as horas seguintes ajustam-se
🥇 Cada troço mostra as opções da mais rápida à mais simples

parou.pt`,
    imagens: ['/novidades/varios-destinos-1.jpg'],
    comunidade: 'Já podes planear uma viagem com várias paragens (até 5): toca no "+" ao lado da pesquisa e escreve cada paragem. Arrasta para mudar a ordem. Cada troço mostra as opções da mais rápida à mais simples, e podes indicar quanto tempo ficas em cada sítio para as horas seguintes se ajustarem.',
  },
  {
    id: 'rotas-combinadas',
    data: '2026-10-13',
    etiqueta: 'Novidade',
    titulo: 'Rotas que juntam operadores',
    texto: `🔗 *Rotas que se juntam*

Já não ficas sem resposta quando a ligação é feita por operadores diferentes. A PAROU agora junta, na mesma viagem:
🚌 autocarro, metro e comboio de operadores diferentes (por exemplo STCP + UNIR, no Porto)
🚶 os minutos a pé em cada troço e até ao teu destino, quando não fica mesmo ao lado da paragem
⏱️ as opções da mais rápida à mais simples

parou.pt`,
    imagens: ['/novidades/rotas-combinadas-1.jpg'],
    comunidade: 'A PAROU já junta autocarros, metro e comboio de operadores diferentes na mesma viagem (por exemplo STCP + UNIR, no Porto) e mostra quantos minutos tens de andar a pé em cada troço e até ao destino. Se uma rota que conheces ainda não aparece, diz-nos aqui.',
  },
  {
    id: 'proxima-ligacao',
    data: '2026-10-13',
    etiqueta: 'Novidade',
    titulo: 'Próxima ligação, mesmo que seja amanhã',
    texto: `🕐 *Já não ficas sem resposta*

Quando não há nada nas próximas horas (o último autocarro já passou, ou a linha é pouco frequente), a PAROU mostra a próxima ligação, mesmo que seja amanhã de manhã.
🔗 Junta duas linhas da UNIR quando é preciso mudar de autocarro
📍 Se não há paragens com horários por perto, diz qual é a mais próxima e a que distância fica

parou.pt`,
    imagens: ['/novidades/proxima-ligacao-1.jpg'],
    comunidade: 'A PAROU já mostra a próxima ligação mesmo quando não há nada nas próximas horas (por exemplo, a primeira da manhã seguinte). Junta também duas linhas da UNIR quando é preciso mudar de autocarro e, se não houver paragens com horários por perto, diz qual é a mais próxima.',
  },
  {
    id: 'ponto-diario',
    data: '2026-10-13',
    etiqueta: 'Novidade',
    titulo: 'Um ponto por dia, só por voltares',
    texto: `🎁 *Ponto diário na PAROU*

Entra na tua conta e resgata 1 ponto por dia. Os pontos abrem peças novas para o teu avatar.
⏱️ Aparece um aviso pequeno quando abres a app; se o fechares, volta na próxima vez (ou resgatas no teu perfil, onde vês a contagem até ao próximo ponto)
📆 Um ponto a cada 24 h, a contar do último que resgataste: se faltares, não acumula

parou.pt`,
    imagens: ['/novidades/ponto-diario-1.jpg'],
    comunidade: 'Já há ponto diário: quem tem conta resgata 1 ponto por dia (aparece um aviso pequeno ao abrir a app, e no perfil vê-se a contagem até ao próximo). Os pontos abrem peças novas do avatar.',
  },
  {
    id: 'idiomas-de-fr',
    data: '2026-10-13',
    etiqueta: 'Novidade',
    titulo: 'Agora também em alemão e francês',
    texto: `🌍 *A PAROU agora fala alemão e francês*

Toca na bandeira no topo e escolhe a língua: 🇵🇹 português, 🇬🇧 inglês, 🇩🇪 alemão ou 🇫🇷 francês.
🧭 Menus, rotas, mapa e alertas mudam todos
📖 Também as páginas de privacidade, termos e contactos

Útil para quem visita Portugal, ou para quem vive cá e prefere outra língua.

parou.pt`,
    imagens: ['/novidades/idiomas-de-fr-1.jpg'],
    comunidade: 'A PAROU já fala alemão e francês, além de português e inglês: toca na bandeira no topo e escolhe a língua. Menus, rotas, mapa e páginas mudam todos. Útil para quem visita Portugal!',
  },
  {
    id: 'atrasos-em-direto',
    data: '2026-10-14',
    etiqueta: 'Novidade',
    titulo: 'Atrasos em direto',
    texto: `⏱️ *Atrasos em direto na PAROU*

No Perto, quando a operadora indica que o autocarro vem atrasado, aparece "Atrasado N min" junto à linha.
🚌 Para já com a STCP e a Carris Metropolitana
🧭 Onde a operadora não indica o atraso, não mostramos nada: não inventamos

parou.pt`,
    imagens: ['/novidades/atrasos-em-direto-1.jpg'],
    comunidade: 'No Perto já aparece "Atrasado N min" quando a operadora indica o atraso real do autocarro (para já STCP e Carris Metropolitana). Onde não há esse dado, não inventamos.',
  },
  {
    id: 'a-bordo',
    data: '2026-10-15',
    etiqueta: 'Novidade',
    titulo: 'Autocarros no mapa e «A bordo»',
    texto: `🚌 *Autocarros em direto no mapa*

No Perto, os autocarros da STCP, da Carris Metropolitana e da TUB (Braga) aparecem a mexer-se no mapa, numa roda azul com o número da linha (801, por exemplo) e a seta do sentido.

🕒 *Braga em direto*: a TUB passou a enviar à PAROU a posição e as horas previstas dos autocarros. No Perto vês o atraso e a hora a que cada um chega à paragem.

📍 *A bordo*: se apanhares um autocarro, a PAROU pergunta «Está a bordo do 801?». Respondes que sim e vês a rota e as próximas paragens, em direto.
🔒 Só pergunta com a app aberta, nunca decide sozinha, e podes desligar em «A tua localização».

🔵 E há um tema novo, o *Azul Porto*: claro, azul e branco. Toca na paleta, no topo.

parou.pt`,
  },
];
