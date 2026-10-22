import React from 'react';
import { t, idioma } from '../i18n';
import { CONTACTO, TELEFONE, TELEFONE_LINK, ATUALIZADO, Secao, PreferenciaContagem, ApagarAqui } from './paginasInfoBase';
import { SobreEn, PrivacidadeEn, TermosEn, ContactarEn, ApagarContaEn } from './paginasInfoEn';
import { ArrowLeft, Mail, Heart, Database, ShieldCheck, FileText, Phone, MessageCircle, Trash2 } from 'lucide-react';

// Alemão e francês só se descarregam para quem os usa
const PaginaDe = React.lazy(() => import('./paginasInfoDe'));
const PaginaFr = React.lazy(() => import('./paginasInfoFr'));

export type PaginaInfo = 'sobre' | 'privacidade' | 'termos' | 'contactar' | 'apagar-conta';

interface Props {
  pagina: PaginaInfo;
  onVoltar: () => void;
  onAbrir: (p: PaginaInfo) => void;
}

function Sobre({ onAbrir }: { onAbrir: (p: PaginaInfo) => void }) {
  return (
    <>
      <p className="text-[15.5px] text-[#2B2B2B] leading-relaxed">
        A PAROU mostra-te, num só sítio, o que passa perto de ti — autocarros, metro, comboios e barcos — com a hora prevista de
        chegada, horários dos principais operadores, greves, avisos de tempo, incêndios e o que mais mexe com as tuas viagens em Portugal.
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
        <p>
          <button onClick={() => onAbrir('contactar')} className="underline font-semibold cursor-pointer">Ver todos os contactos</button>
        </p>
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
          telemóvel fica a última posição, até 12 horas, para a app abrir logo no sítio certo. Com a localização ligada, a app
          também lê o sensor de movimento do telemóvel, só no próprio aparelho, para saber se estás parado e não deixar o ponto
          a tremer no mapa; esses valores não são guardados nem enviados. Podes retirar a autorização a qualquer momento nas
          definições do browser ou do telemóvel.
        </p>
        <p>
          <strong>Autocarros em direto e «A bordo».</strong> Para mostrar no mapa os autocarros da zona, a app pede ao servidor só
          os autocarros das linhas e da área que estás a ver, e a tua posição não fica guardada. Com a app aberta e a deslocares-te
          como num veículo, o telemóvel compara o seu próprio percurso (GPS) com o dos autocarros da zona, no próprio aparelho, para
          te perguntar «Está a bordo do 801?». Nunca decide sozinho: só mostras a viagem se responderes que sim. A app não deteta
          nada com o ecrã fechado nem em segundo plano. Podes desligar esta pergunta em «A tua localização».
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
          <strong>Conta (opcional).</strong> Se criares conta, guardamos no nosso servidor o teu nome, o teu email e uma versão
          cifrada da palavra-passe (nunca a palavra-passe em si), para sincronizar os favoritos entre dispositivos e para
          identificar as ocorrências que publicas. Ao entrares, guardamos no telemóvel um cookie técnico de sessão
          (<em>parou_sessao</em>, 30 dias) para não teres de entrar de cada vez. O email nunca é mostrado a outras pessoas. Guardamos também o idioma da app e o dia e hora do último acesso à conta,
          que só a administração da PAROU vê.
        </p>
        <p>
          <strong>Ocorrências e comentários que publicas.</strong> São públicos (título, descrição, local, hora, a foto, se
          juntares uma, e o nome que escolheres mostrar), porque o objetivo é avisar outras pessoas. A foto é opcional e só a
          enviamos se a escolheres tu; não incluas pessoas reconhecíveis nem matrículas.
        </p>
        <p>
          <strong>Dados técnicos.</strong> Como em qualquer site, o servidor recebe o endereço IP e o tipo de browser para entregar
          as páginas e proteger o serviço contra abusos. Não os usamos para te identificar e não os guardamos para além do
          necessário (no máximo 30 dias nos registos do servidor).
        </p>
        <p>
          <strong>Registo de segurança.</strong> Para proteger a PAROU de ataques e abusos, o servidor regista só <em>eventos suspeitos</em>
          (por exemplo, tentativas de aceder à administração sem chave, palavras-passe erradas repetidas, pedidos em excesso ou erros
          internos), e não cada visita. Guarda o tipo de evento, a hora cheia, a rota (sem o que escreveste) e um código calculado a partir do
          teu IP que muda todos os dias, por isso não serve para te seguir de um dia para o outro. Não guarda o IP em claro, cookies,
          palavras-passe, emails nem a tua posição. Apaga-se sozinho ao fim de 30 dias.
        </p>
        <p>
          <strong>Relatórios de erro.</strong> Se a app falhar, envia-nos o texto técnico do erro, a página onde aconteceu e o tipo de
          browser ou telemóvel, para o corrigirmos. Não leva o teu nome, email nem a tua posição, e fica nos registos do servidor
          pelo mesmo prazo (30 dias no máximo).
        </p>
        <p>
          <strong>Contagem anónima de utilizadores.</strong> Para sabermos quantas pessoas usam a PAROU (e se ela está a fazer falta),
          contamos as aberturas da app e das páginas públicas do site (por exemplo, a de uma linha ou paragem) com um número aleatório guardado num cookie (<em>parou_visita</em>, 13 meses). Assim, quem abre a
          app muitas vezes no mesmo dia, ou volta noutro dia, conta como a mesma pessoa. No servidor ficam só esse número cifrado, o
          dia, o idioma, se abriste pela app Android, pela app instalada ou pelo site, e se chegaste pela app ou por uma página pública. Não guardamos o teu IP nem o tipo de
          browser, não ligamos isto à tua conta e não o partilhamos com ninguém. Só nós vemos os totais. Se preferires não ser contado,
          podes desligar aqui:
        </p>
        <PreferenciaContagem />
        <p>
          <strong>Não usamos</strong> publicidade, perfis de utilizador, cookies de publicidade nem ferramentas de análise de terceiros.
        </p>
      </Secao>
      <Secao titulo="Fundamento">
        <p>
          A localização e a conta baseiam-se no teu consentimento (podes retirá-lo quando quiseres). A cópia dos favoritos, a contagem
          anónima de utilizadores, o registo de segurança, os dados técnicos e as ocorrências públicas baseiam-se no interesse legítimo de prestar, melhorar e proteger o serviço que pediste (podes opor-te à contagem a qualquer momento, como acima).
        </p>
      </Secao>
      <Secao titulo="Com quem partilhamos">
        <p>
          Não vendemos nem cedemos dados. Usamos estes prestadores, só para o funcionamento da PAROU: Hetzner (alojamento do servidor,
          na Alemanha, onde ficam também as contas, as ocorrências e a cópia dos favoritos), os serviços de
          notificações da Google, Apple e Mozilla (entregam as notificações, se as ligares) e OpenStreetMap (o teu browser descarrega
          os mapas diretamente dos servidores do OpenStreetMap, que veem o teu endereço IP) e Photon, da Komoot (quando procuras uma
          morada, o nosso servidor envia-lhe só o texto escrito e a zona aproximada, nunca o teu IP). Os serviços de notificações podem tratar dados fora da União
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
          em até 30 dias. Passo a passo e o que é apagado em <a className="underline font-semibold" href="/apagar-conta">Apagar a conta</a>. Podes ainda apresentar queixa à Comissão Nacional de Proteção de Dados (www.cnpd.pt).
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
          dúvida confirma junto do operador. A PAROU não é uma entidade governamental nem um serviço oficial de nenhum operador,
          da Proteção Civil ou do IPMA — em emergência liga 112.
        </p>
        <p>
          Fazemos o possível para que a informação esteja certa e atualizada, mas não garantimos que o serviço esteja sempre
          disponível nem respondemos por prejuízos resultantes do uso da informação (por exemplo, perder um transporte).
        </p>
      </Secao>
      <Secao titulo="O que publicas">
        <p>
          As ocorrências, publicações, respostas e comentários que publicas são públicos e da tua responsabilidade. Não publiques
          informação falsa, insultos, assédio ou ameaças, discurso de ódio ou discriminação, conteúdo sexual ou violento, fotos de
          pessoas reconhecíveis ou matrículas, dados pessoais de outras pessoas, publicidade ou spam, nem conteúdo ilegal. Não te
          faças passar por outra pessoa, operador ou entidade.
        </p>
        <p>
          Qualquer pessoa pode <strong>denunciar</strong> uma publicação, resposta ou ocorrência (no menu de cada uma)
          e <strong>bloquear</strong> outro utilizador para deixar de ver o que ele escreve. Analisamos as denúncias e ocultamos ou
          apagamos o conteúdo que viole estas regras e, em caso de abuso repetido, suspendemos a conta. Para denunciar de outra
          forma, escreve para <a className="underline font-semibold" href={`mailto:${CONTACTO}`}>{CONTACTO}</a>.
        </p>
      </Secao>
      <Secao titulo="Medalha Pioneiro">
        <p>
          Quem criar uma conta até às 23:59 de 31 de dezembro de 2026 (hora de Lisboa) recebe, automaticamente, a medalha «Pioneiro»,
          que aparece no perfil. É gratuita, não se compra nem se pode pedir depois dessa data, e não dá qualquer direito a pagamentos
          ou a serviços. Se apagares a conta, perdes a medalha e não a podes recuperar criando outra conta depois do prazo.
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

function Contactar() {
  const linha = 'flex items-center gap-3 min-h-[56px] px-4 py-2 rounded-[14px] border border-[#E6E6E3] bg-[#FFFFFF] active:bg-[#F4F4F2]';
  return (
    <>
      <p className="text-[15.5px] text-[#2B2B2B] leading-relaxed">
        A PAROU é um projeto feito por uma pessoa, para toda a gente. Se tens uma dúvida, uma sugestão, encontraste um erro, queres
        propor uma parceria ou és um operador e queres partilhar dados, fala comigo — para qualquer questão ou assunto.
        Respondo pessoalmente, normalmente em poucos dias.
      </p>
      <div className="rounded-[14px] bg-[#F4F4F2] p-4 flex gap-3">
        <MessageCircle className="w-5 h-5 text-[#FF6B1A] shrink-0 mt-0.5" />
        <div className="text-[14px] text-[#111111] leading-snug">
          <div className="font-bold text-[16px]">Dinis Sousa</div>
          <div className="text-[#6B6B6B]">Autor da PAROU.PT</div>
        </div>
      </div>
      <div className="space-y-2">
        <a href={`mailto:${CONTACTO}?subject=PAROU`} className={linha}>
          <Mail className="w-5 h-5 text-[#111111] shrink-0" />
          <span className="flex flex-col leading-tight">
            <span className="text-[12px] text-[#6B6B6B]">Email</span>
            <span className="text-[15px] font-semibold text-[#111111] break-all">{CONTACTO}</span>
          </span>
        </a>
        <a href={`tel:${TELEFONE_LINK}`} className={linha}>
          <Phone className="w-5 h-5 text-[#111111] shrink-0" />
          <span className="flex flex-col leading-tight">
            <span className="text-[12px] text-[#6B6B6B]">Telemóvel</span>
            <span className="text-[15px] font-semibold text-[#111111]">{TELEFONE}</span>
          </span>
        </a>
      </div>
      <Secao titulo="Sobre o que me podes escrever">
        <p>Erros nos horários ou nas paragens, linhas em falta, sugestões de melhoria, imprensa e parcerias, dados de operadores, pedidos sobre os teus dados (RGPD) ou simplesmente uma palavra de ajuda.</p>
        <p>Para dúvidas de privacidade ou para apagar a conta, vê também a <a className="underline font-semibold" href="/privacidade">política de privacidade</a>.</p>
      </Secao>
    </>
  );
}

function ApagarConta() {
  const botao = 'flex items-center gap-3 min-h-[56px] px-4 py-2 rounded-[14px] border border-[#E6E6E3] bg-[#FFFFFF] active:bg-[#F4F4F2]';
  return (
    <>
      <p className="text-[13px] text-[#6B6B6B]">Última atualização: {ATUALIZADO}</p>
      <p>
        Aqui explicamos como apagar a tua conta da <strong>PAROU</strong> (a app PAROU para Android e o site parou.pt) e os dados
        que ficam ligados a ela. Não precisas de conta para usar a PAROU: se nunca criaste uma, não há nada a apagar.
      </p>
      <ApagarAqui />
      <Secao titulo="Como apagar a conta">
        <p><strong>1. Na app ou no site (imediato).</strong></p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Entra na tua conta da PAROU.</li>
          <li>Toca no teu nome, no canto superior direito, para abrir o teu perfil.</li>
          <li>Desce até ao fim e toca em <strong>Apagar conta</strong>.</li>
          <li>Escreve a tua palavra-passe e confirma em <strong>Sim, apagar a conta</strong>.</li>
        </ol>
        <p>A conta e os dados ligados a ela são apagados logo ali.</p>
        <p><strong>2. Por email</strong>, se já não tens a app ou te esqueceste da palavra-passe.</p>
        <a href={`mailto:${CONTACTO}?subject=Apagar%20conta%20PAROU&body=Quero%20apagar%20a%20minha%20conta%20da%20PAROU.%20O%20email%20da%20conta%20%C3%A9%3A%20`} className={botao}>
          <Mail className="w-5 h-5 text-[#111111] shrink-0" />
          <span className="flex flex-col leading-tight">
            <span className="text-[12px] text-[#6B6B6B]">Pedir por email</span>
            <span className="text-[15px] font-semibold text-[#111111] break-all">{CONTACTO}</span>
          </span>
        </a>
        <p>
          Escreve do email com que criaste a conta (ou diz-nos qual é). Confirmamos que és tu e apagamos a conta em até 30 dias,
          normalmente em muito menos.
        </p>
      </Secao>
      <Secao titulo="O que é apagado">
        <ul className="list-disc pl-5 space-y-1">
          <li>O teu nome e o teu email.</li>
          <li>A palavra-passe (só guardamos uma versão irreversível, nunca a palavra-passe em si).</li>
          <li>O avatar, os pontos e as medalhas.</li>
          <li>Os favoritos sincronizados com a conta.</li>
          <li>As sessões iniciadas em todos os dispositivos e os pedidos de recuperação da palavra-passe.</li>
          <li>Os teus votos, denúncias e a lista de pessoas que bloqueaste.</li>
        </ul>
      </Secao>
      <Secao titulo="O que fica">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            As ocorrências, publicações, respostas e comentários que escreveste continuam visíveis para ajudar outras pessoas, mas
            como <strong>“Utilizador PAROU”</strong>, sem qualquer ligação à tua conta. Se preferires, apaga-os tu antes de apagares
            a conta, ou pede-nos por email que os removamos.
          </li>
          <li>
            Os registos técnicos do servidor (endereço IP e tipo de browser, para segurança) apagam-se sozinhos ao fim de 30 dias.
          </li>
          <li>A contagem anónima de utilizadores não está ligada à tua conta.</li>
        </ul>
        <p>Depois de apagada, a conta não pode ser recuperada. Podes criar uma nova quando quiseres.</p>
      </Secao>
      <Secao titulo="Mais informação">
        <p>
          Lê a <a className="underline font-semibold" href="/privacidade">política de privacidade</a> para saberes que dados a PAROU
          usa e quais são os teus direitos, ou <a className="underline font-semibold" href="/contactar">fala connosco</a>.
        </p>
      </Secao>
    </>
  );
}

const TITULOS: Record<PaginaInfo, { titulo: string; icone: React.ElementType }> = {
  sobre: { titulo: 'Sobre a PAROU', icone: Database },
  privacidade: { titulo: 'Política de privacidade', icone: ShieldCheck },
  termos: { titulo: 'Termos de utilização', icone: FileText },
  contactar: { titulo: 'Contactar', icone: Mail },
  'apagar-conta': { titulo: 'Apagar a conta PAROU', icone: Trash2 },
};

export const PaginaInformativa: React.FC<Props> = ({ pagina, onVoltar, onAbrir }) => {
  const titulo = t(TITULOS[pagina].titulo);
  return (
    <article className="w-full max-w-2xl mx-auto px-4 sm:px-6 pt-4 pb-10 space-y-5 text-[14.5px] text-[#2B2B2B] leading-relaxed">
      <button onClick={onVoltar} className="inline-flex items-center gap-1.5 h-9 pr-3 text-[13px] font-semibold text-[#6B6B6B] cursor-pointer">
        <ArrowLeft className="w-4 h-4" /> {t('Voltar')}
      </button>
      <h1 className="text-[28px] leading-tight font-bold tracking-tight text-[#111111]">{titulo}</h1>
      {idioma === 'en'
        ? (pagina === 'sobre' ? <SobreEn onAbrir={onAbrir} /> : pagina === 'privacidade' ? <PrivacidadeEn /> : pagina === 'contactar' ? <ContactarEn /> : pagina === 'apagar-conta' ? <ApagarContaEn /> : <TermosEn />)
        : idioma === 'de'
          ? <React.Suspense fallback={<div className="min-h-[100dvh]" aria-hidden="true" />}><PaginaDe pagina={pagina} onAbrir={onAbrir} /></React.Suspense>
          : idioma === 'fr'
            ? <React.Suspense fallback={<div className="min-h-[100dvh]" aria-hidden="true" />}><PaginaFr pagina={pagina} onAbrir={onAbrir} /></React.Suspense>
            : (pagina === 'sobre' ? <Sobre onAbrir={onAbrir} /> : pagina === 'privacidade' ? <Privacidade /> : pagina === 'contactar' ? <Contactar /> : pagina === 'apagar-conta' ? <ApagarConta /> : <Termos />)}
    </article>
  );
};
