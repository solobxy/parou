import React from 'react';
import { ArrowLeft, Mail, Heart, Database, ShieldCheck, FileText } from 'lucide-react';

export type PaginaInfo = 'sobre' | 'privacidade' | 'termos';

interface Props {
  pagina: PaginaInfo;
  onVoltar: () => void;
  onAbrir: (p: PaginaInfo) => void;
}

const CONTACTO = 'diniscash@gmail.com';
const ATUALIZADO = '8 de outubro de 2026';

function Secao({ titulo, children, id }: { titulo: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="space-y-2 scroll-mt-20">
      <h2 className="text-[17px] font-bold text-[#111111] leading-snug">{titulo}</h2>
      <div className="text-[14.5px] text-[#2B2B2B] leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

function Sobre({ onAbrir }: { onAbrir: (p: PaginaInfo) => void }) {
  return (
    <>
      <p className="text-[15.5px] text-[#2B2B2B] leading-relaxed">
        A PAROU mostra-te, num só sítio, o que passa perto de ti — autocarros, metro, comboios e barcos — com a hora prevista de
        chegada, horários de todas as linhas, greves, avisos de tempo, incêndios e o que mais mexe com as tuas viagens em Portugal.
      </p>
      <div className="rounded-[14px] bg-[#F4F4F2] p-4 flex gap-3">
        <Heart className="w-5 h-5 text-[#FF6B1A] shrink-0 mt-0.5" />
        <p className="text-[14px] text-[#111111] leading-snug">
          <strong>Gratuita e sem fins lucrativos.</strong> Sem publicidade, sem subscrições e sem venda de dados. Feita para os cidadãos.
        </p>
      </div>
      <Secao titulo="De onde vêm os dados">
        <p>
          Horários oficiais (GTFS) publicados pelos operadores e pelo Ponto de Acesso Nacional (IMT), tempo real onde os operadores o
          disponibilizam (por exemplo Carris Metropolitana e STCP), avisos e previsões do IPMA e do Open-Meteo, incêndios e
          ocorrências da Proteção Civil através do Fogos.pt (dados da ANEPC), perturbações anunciadas pelos operadores e notícias de
          órgãos de comunicação social portugueses. Mapas © colaboradores do OpenStreetMap.
        </p>
        <p>
          Onde não há tempo real, a hora mostrada é a do horário oficial. Os horários são atualizados todos os dias.
        </p>
      </Secao>
      <Secao titulo="Contactos">
        <p>
          Encontraste um erro, falta uma linha ou és um operador e queres partilhar dados? Escreve-nos:
        </p>
        <a href={`mailto:${CONTACTO}?subject=PAROU`} className="inline-flex items-center gap-2 h-11 px-4 rounded-[12px] bg-[#111111] text-[#FFFFFF] font-semibold text-[14px]">
          <Mail className="w-4 h-4" /> {CONTACTO}
        </a>
      </Secao>
      <div className="grid grid-cols-2 gap-2 pt-2">
        <button onClick={() => onAbrir('privacidade')} className="h-12 rounded-[12px] border border-[#E6E6E3] text-[14px] font-semibold text-[#111111] flex items-center justify-center gap-2 cursor-pointer">
          <ShieldCheck className="w-4 h-4" /> Privacidade
        </button>
        <button onClick={() => onAbrir('termos')} className="h-12 rounded-[12px] border border-[#E6E6E3] text-[14px] font-semibold text-[#111111] flex items-center justify-center gap-2 cursor-pointer">
          <FileText className="w-4 h-4" /> Termos
        </button>
      </div>
    </>
  );
}

function Privacidade() {
  return (
    <>
      <p className="text-[13px] text-[#6B6B6B]">Última atualização: {ATUALIZADO}</p>
      <p>
        Esta política explica que dados a PAROU (parou.pt e a app PAROU) usa, para quê e quais são os teus direitos, nos termos do
        Regulamento Geral sobre a Proteção de Dados (RGPD). Usamos o mínimo possível: a maior parte da app funciona sem conta e
        sem saber quem és.
      </p>
      <Secao titulo="Quem é o responsável">
        <p>
          PAROU.PT, projeto de Dinis Sousa. Contacto para qualquer questão de privacidade:{' '}
          <a className="underline font-semibold" href={`mailto:${CONTACTO}`}>{CONTACTO}</a>.
        </p>
      </Secao>
      <Secao titulo="Que dados usamos e para quê">
        <p>
          <strong>Localização (só se a autorizares).</strong> Serve para mostrar as paragens e os transportes perto de ti. A tua
          posição é enviada ao nosso servidor apenas para calcular as paragens próximas e não fica guardada no servidor. No teu
          telemóvel fica a última posição, até 12 horas, para a app abrir logo no sítio certo. Podes retirar a autorização a
          qualquer momento nas definições do browser ou do telemóvel.
        </p>
        <p>
          <strong>Favoritos e preferências.</strong> Ficam guardados no teu telemóvel. Para não se perderem (alguns browsers apagam
          estes dados), guardamos uma cópia no servidor associada a um identificador aleatório num cookie técnico
          (<em>parou_id</em>). Esse identificador não diz quem és e não é usado para mais nada.
        </p>
        <p>
          <strong>Notificações (só se as ligares).</strong> Guardamos o endereço de entrega que o teu browser nos dá (do serviço de
          notificações da Google, da Apple ou da Mozilla) e os distritos que escolheste, para te enviar avisos de greves, mau tempo
          e perturbações graves. O conteúdo das notificações vai cifrado. Ao desligares as notificações, estes dados são apagados.
        </p>
        <p>
          <strong>Conta (opcional).</strong> Se entrares com Google ou email, usamos o teu nome, email e foto de perfil para a conta,
          para sincronizar os favoritos entre dispositivos e para identificar as ocorrências que publicas. O email nunca é mostrado
          a outras pessoas.
        </p>
        <p>
          <strong>Ocorrências e comentários que publicas.</strong> São públicos (título, descrição, local, hora e o nome que
          escolheres mostrar), porque o objetivo é avisar outras pessoas.
        </p>
        <p>
          <strong>Dados técnicos.</strong> Como em qualquer site, o servidor recebe o endereço IP e o tipo de browser para entregar
          as páginas e proteger o serviço contra abusos. Não os usamos para te identificar e não os guardamos para além do
          necessário (no máximo 30 dias nos registos do servidor).
        </p>
        <p>
          <strong>Não usamos</strong> publicidade, perfis de utilizador, cookies de publicidade nem ferramentas de análise de terceiros.
        </p>
      </Secao>
      <Secao titulo="Fundamento">
        <p>
          A localização e a conta baseiam-se no teu consentimento (podes retirá-lo quando quiseres). A cópia dos favoritos, os dados
          técnicos e as ocorrências públicas baseiam-se no interesse legítimo de prestar e proteger o serviço que pediste.
        </p>
      </Secao>
      <Secao titulo="Com quem partilhamos">
        <p>
          Não vendemos nem cedemos dados. Usamos estes prestadores, só para o funcionamento da PAROU: Hetzner (alojamento do servidor,
          na Alemanha), Google Firebase (contas, ocorrências e sincronização de favoritos), os serviços de
          notificações da Google, Apple e Mozilla (entregam as notificações, se as ligares) e OpenStreetMap (o teu browser descarrega
          os mapas diretamente dos servidores do OpenStreetMap, que veem o teu endereço IP) e Photon, da Komoot (quando procuras uma
          morada, o nosso servidor envia-lhe só o texto escrito e a zona aproximada, nunca o teu IP). O Google pode tratar dados fora da União
          Europeia, com as garantias previstas no RGPD (cláusulas contratuais-tipo).
        </p>
      </Secao>
      <Secao titulo="Durante quanto tempo">
        <p>
          A cópia dos favoritos e a subscrição das notificações são apagadas ao fim de 13 meses sem
          utilização (a subscrição também quando desligas as notificações). Os dados da conta ficam enquanto a conta existir. As
          ocorrências deixam de aparecer ao fim de 24 horas ou quando são dadas como resolvidas.
        </p>
      </Secao>
      <Secao titulo="Os teus direitos" id="apagar-conta">
        <p>
          Podes pedir acesso, correção, apagamento, limitação, portabilidade ou opor-te ao tratamento dos teus dados. Para{' '}
          <strong>apagar a conta</strong> e os dados associados: entra na app, abre o teu perfil (toca no teu nome, no canto
          superior direito) e escolhe <strong>Apagar conta</strong>. Também o podes pedir por email para{' '}
          <a className="underline font-semibold" href={`mailto:${CONTACTO}?subject=Apagar%20conta%20PAROU`}>{CONTACTO}</a>; respondemos
          em até 30 dias. Podes ainda apresentar queixa à Comissão Nacional de Proteção de Dados (www.cnpd.pt).
        </p>
      </Secao>
      <Secao titulo="Crianças">
        <p>A PAROU não se destina a menores de 13 anos e não recolhe conscientemente dados de crianças.</p>
      </Secao>
      <Secao titulo="Alterações">
        <p>Se esta política mudar, a data acima é atualizada e, se a mudança for importante, avisamos na app.</p>
      </Secao>
    </>
  );
}

function Termos() {
  return (
    <>
      <p className="text-[13px] text-[#6B6B6B]">Última atualização: {ATUALIZADO}</p>
      <Secao titulo="O serviço">
        <p>
          A PAROU é um serviço gratuito e sem fins lucrativos de informação sobre transportes públicos e mobilidade em Portugal. Ao
          usá-la aceitas estes termos.
        </p>
      </Secao>
      <Secao titulo="Informação indicativa">
        <p>
          Os horários, os tempos de chegada, os alertas e as restantes informações vêm de fontes públicas e de terceiros (operadores,
          IPMA, Proteção Civil, comunicação social e comunidade) e podem ter atrasos, erros ou falhas. São indicativos: em caso de
          dúvida confirma junto do operador. A PAROU não é um serviço oficial de nenhum operador nem da Proteção Civil — em
          emergência liga 112.
        </p>
        <p>
          Fazemos o possível para que a informação esteja certa e atualizada, mas não garantimos que o serviço esteja sempre
          disponível nem respondemos por prejuízos resultantes do uso da informação (por exemplo, perder um transporte).
        </p>
      </Secao>
      <Secao titulo="O que publicas">
        <p>
          As ocorrências e comentários que publicas são públicos e da tua responsabilidade. Não publiques informação falsa, ofensiva,
          dados pessoais de outras pessoas, publicidade ou conteúdo ilegal. Podemos ocultar ou apagar conteúdo que viole estas regras
          e, em caso de abuso repetido, suspender a conta. A comunidade pode assinalar conteúdo inadequado.
        </p>
      </Secao>
      <Secao titulo="Utilização correta">
        <p>
          Não é permitido tentar perturbar o serviço, aceder a áreas reservadas, nem recolher dados em massa de forma automática sem
          autorização.
        </p>
      </Secao>
      <Secao titulo="Fontes e direitos">
        <p>
          Os dados pertencem às respetivas fontes, que são indicadas na app: operadores de transportes (GTFS), IMT, IPMA, Open-Meteo,
          Fogos.pt e ANEPC, OpenStreetMap e os órgãos de comunicação social (as notícias abrem no site de origem). A marca e o
          design da PAROU pertencem ao projeto PAROU.PT.
        </p>
      </Secao>
      <Secao titulo="Lei aplicável">
        <p>
          Estes termos regem-se pela lei portuguesa. Dúvidas ou reclamações:{' '}
          <a className="underline font-semibold" href={`mailto:${CONTACTO}`}>{CONTACTO}</a>.
        </p>
      </Secao>
    </>
  );
}

const TITULOS: Record<PaginaInfo, { titulo: string; icone: React.ElementType }> = {
  sobre: { titulo: 'Sobre a PAROU', icone: Database },
  privacidade: { titulo: 'Política de privacidade', icone: ShieldCheck },
  termos: { titulo: 'Termos de utilização', icone: FileText },
};

export const PaginaInformativa: React.FC<Props> = ({ pagina, onVoltar, onAbrir }) => {
  const { titulo } = TITULOS[pagina];
  return (
    <article className="w-full max-w-2xl mx-auto px-4 sm:px-6 pt-4 pb-10 space-y-5 text-[14.5px] text-[#2B2B2B] leading-relaxed">
      <button onClick={onVoltar} className="inline-flex items-center gap-1.5 h-9 pr-3 text-[13px] font-semibold text-[#6B6B6B] cursor-pointer">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>
      <h1 className="text-[28px] leading-tight font-bold tracking-tight text-[#111111]">{titulo}</h1>
      {pagina === 'sobre' ? <Sobre onAbrir={onAbrir} /> : pagina === 'privacidade' ? <Privacidade /> : <Termos />}
    </article>
  );
};
