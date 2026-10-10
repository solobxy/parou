// Novidades da app já escritas para o canal do WhatsApp (painel "Para o WhatsApp" › Novidades).
// Sempre que se publica algo que as pessoas vejam, acrescenta-se aqui uma entrada no topo, com o texto
// pronto a colar. O que já foi publicado fica marcado no telemóvel do administrador e deixa de aparecer.
// Formato do WhatsApp: *negrito* (os asteriscos colados ao texto) e _itálico_. Textos curtos e diretos.

export interface NovidadeCanal {
  /** Fixo: é com ele que o painel lembra o que já foi publicado (nunca mudar nem reutilizar) */
  id: string;
  /** Dia em que a novidade saiu na app (aaaa-mm-dd) */
  data: string;
  /** Etiqueta no painel */
  etiqueta: string;
  titulo: string;
  /** Texto final, como vai para o canal */
  texto: string;
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
  },
  {
    id: 'perto-fluido',
    data: '2026-10-10',
    etiqueta: 'Novidade',
    titulo: 'Perto de ti, mais fluido e preciso',
    texto: `📍 *Perto de ti, mais fluido e mais preciso*

O mapa ficou mais leve e a tua posição deixou de "tremer". Quando o sinal de GPS está fraco, vês um círculo com a margem de erro, e as distâncias às paragens atualizam enquanto andas.

parou.pt`,
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
  },
  {
    id: 'ingles',
    data: '2026-10-10',
    etiqueta: 'Novidade',
    titulo: 'PAROU também em inglês',
    texto: `🌍 *A PAROU também fala inglês*

Toca em *EN* no topo e a app muda para inglês. Útil para quem visita Portugal.

parou.pt`,
  },
];
