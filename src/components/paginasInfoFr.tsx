// Version française des pages À propos, Confidentialité, Conditions, Contact et Supprimer le compte (même structure que les versions portugaise et anglaise).
import React from 'react';
import { Mail, Heart, ShieldCheck, FileText, Phone, MessageCircle } from 'lucide-react';
import type { PaginaInfo } from './PaginaInformativa';
import { CONTACTO, TELEFONE, TELEFONE_LINK, Secao, PreferenciaContagem, ApagarAqui } from './paginasInfoBase';

const ATUALIZADO_FR = '15 octobre 2026';

export function SobreFr({ onAbrir }: { onAbrir: (p: PaginaInfo) => void }) {
  return (
    <>
      <p className="text-[15.5px] text-[#2B2B2B] leading-relaxed">
        PAROU vous montre, au même endroit, ce qui circule près de vous — bus, métro, trains et bateaux — avec l’heure d’arrivée prévue,
        les horaires des principaux opérateurs, les grèves, les alertes météo, les incendies et tout ce qui touche vos trajets au
        Portugal.
      </p>
      <div className="rounded-[14px] bg-[#F4F4F2] p-4 flex gap-3">
        <Heart className="w-5 h-5 text-[#FF6B1A] shrink-0 mt-0.5" />
        <p className="text-[14px] text-[#111111] leading-snug">
          <strong>Gratuit et à but non lucratif.</strong> Sans publicité, sans abonnement et sans vente de données. Fait pour les citoyens.
        </p>
      </div>
      <Secao titulo="D’où viennent les données">
        <p>
          Les horaires officiels (GTFS) publiés par les opérateurs et par le Point d’accès national (IMT), les données en temps réel
          quand les opérateurs les fournissent (par exemple Carris Metropolitana et STCP), les alertes et prévisions de l’IPMA et
          d’Open-Meteo, les incendies et interventions de la Protection civile via Fogos.pt (données de l’ANEPC), les perturbations
          annoncées par les opérateurs et l’actualité des médias portugais. Cartes © contributeurs d’OpenStreetMap.
        </p>
        <p>
          Quand il n’y a pas de données en temps réel, l’heure affichée est celle de l’horaire officiel. Les horaires sont mis à jour chaque jour.
        </p>
      </Secao>
      <Secao titulo="Contact">
        <p>
          Vous avez trouvé une erreur, il manque une ligne, ou vous êtes un opérateur et vous souhaitez partager des données ? Écrivez-nous :
        </p>
        <a href={`mailto:${CONTACTO}?subject=PAROU`} className="inline-flex items-center gap-2 h-11 px-4 rounded-[12px] bg-[#111111] text-[#FFFFFF] font-semibold text-[14px]">
          <Mail className="w-4 h-4" /> {CONTACTO}
        </a>
        <p>
          <button onClick={() => onAbrir('contactar')} className="underline font-semibold cursor-pointer">Voir toutes les coordonnées</button>
        </p>
      </Secao>
      <div className="grid grid-cols-2 gap-2 pt-2">
        <button onClick={() => onAbrir('privacidade')} className="h-12 rounded-[12px] border border-[#E6E6E3] text-[14px] font-semibold text-[#111111] flex items-center justify-center gap-2 cursor-pointer">
          <ShieldCheck className="w-4 h-4" /> Confidentialité
        </button>
        <button onClick={() => onAbrir('termos')} className="h-12 rounded-[12px] border border-[#E6E6E3] text-[14px] font-semibold text-[#111111] flex items-center justify-center gap-2 cursor-pointer">
          <FileText className="w-4 h-4" /> Conditions
        </button>
      </div>
    </>
  );
}

export function PrivacidadeFr() {
  return (
    <>
      <p className="text-[13px] text-[#6B6B6B]">Dernière mise à jour : {ATUALIZADO_FR}</p>
      <p>
        Cette politique explique quelles données PAROU (parou.pt et l’application PAROU) utilise, pourquoi, et quels sont vos droits au
        titre du Règlement général sur la protection des données (RGPD). Nous en utilisons le moins possible : la plus grande partie de
        l’application fonctionne sans compte et sans savoir qui vous êtes.
      </p>
      <Secao titulo="Qui est responsable">
        <p>
          PAROU.PT, un projet de Dinis Sousa. Contact pour toute question de confidentialité :{' '}
          <a className="underline font-semibold" href={`mailto:${CONTACTO}`}>{CONTACTO}</a>.
        </p>
      </Secao>
      <Secao titulo="Quelles données nous utilisons et pourquoi">
        <p>
          <strong>Position (uniquement si vous l’autorisez).</strong> Elle sert à afficher les arrêts et les services près de vous. Votre position
          n’est envoyée à notre serveur que pour calculer les arrêts proches et n’y est pas conservée. Votre dernière position reste sur votre
          téléphone, jusqu’à 12 heures, pour que l’application s’ouvre au bon endroit. Tant que la position est activée, l’application lit aussi
          le capteur de mouvement du téléphone, uniquement sur l’appareil, pour savoir si vous êtes immobile et éviter que le point tremble sur
          la carte ; ces valeurs ne sont ni conservées ni envoyées. Vous pouvez retirer l’autorisation à tout moment dans
          les paramètres de votre navigateur ou de votre téléphone.
        </p>
        <p>
          <strong>Favoris et préférences.</strong> Ils sont enregistrés sur votre téléphone. Pour qu’ils ne se perdent pas (certains
          navigateurs effacent ces données), nous gardons une copie sur le serveur, liée à un identifiant aléatoire placé dans un cookie
          technique (<em>parou_id</em>). Cet identifiant ne dit pas qui vous êtes et n’est utilisé pour rien d’autre.
        </p>
        <p>
          <strong>Notifications (uniquement si vous les activez).</strong> Nous conservons l’adresse de livraison fournie par votre navigateur
          (via le service de notifications de Google, d’Apple ou de Mozilla) et les districts que vous avez choisis, afin de pouvoir vous envoyer
          des alertes sur les grèves, le mauvais temps et les perturbations graves. Le contenu des notifications est chiffré. Quand vous
          désactivez les notifications, ces données sont supprimées.
        </p>
        <p>
          <strong>Compte (facultatif).</strong> Si vous créez un compte, nous conservons votre nom, votre e-mail et une version chiffrée de votre mot
          de passe (jamais le mot de passe lui-même) sur notre serveur, pour synchroniser les favoris entre appareils et identifier les
          incidents que vous publiez. Quand vous vous connectez, nous enregistrons sur votre téléphone un cookie technique de session
          (<em>parou_sessao</em>, 30 jours) pour que vous n’ayez pas à vous reconnecter à chaque fois. Votre e-mail n’est jamais montré aux
          autres personnes. Nous conservons aussi la langue de l’appli ainsi que la date et l’heure de la dernière utilisation du compte,
          que seule l’administration de PAROU peut voir.
        </p>
        <p>
          <strong>Incidents et commentaires que vous publiez.</strong> Ils sont publics (titre, description, lieu, heure, la photo si vous en
          ajoutez une, et le nom que vous choisissez d’afficher), car le but est d’avertir les autres. La photo est facultative et n’est envoyée
          que si vous la choisissez ; merci de ne pas inclure de personnes reconnaissables ni de plaques d’immatriculation.
        </p>
        <p>
          <strong>Données techniques.</strong> Comme sur tout site web, le serveur reçoit l’adresse IP et le type de navigateur pour
          fournir les pages et protéger le service contre les abus. Nous ne les utilisons pas pour vous identifier et ne les conservons pas
          plus longtemps que nécessaire (30 jours au maximum dans les journaux du serveur).
        </p>
        <p>
          <strong>Journal de sécurité.</strong> Pour protéger PAROU contre les attaques et les abus, le serveur n’enregistre que les
          <em>événements suspects</em> (par exemple, tentatives d’accès à l’administration sans clé, mots de passe erronés répétés,
          requêtes excessives ou erreurs internes), et non chaque visite. Il conserve le type d’événement, l’heure, la route (sans ce que vous
          avez saisi) et un code calculé à partir de votre IP qui change chaque jour, et ne permet donc pas de vous suivre d’un jour à l’autre.
          Il ne conserve ni l’IP en clair, ni cookies, mots de passe, e-mails ou position. Il s’efface tout seul après 30 jours.
        </p>
        <p>
          <strong>Rapports d’erreurs.</strong> Si l’application plante, elle nous envoie le texte technique de l’erreur, la page où cela
          s’est produit et le type de navigateur ou de téléphone, pour que nous puissions corriger le problème. Ils ne contiennent ni votre
          nom, ni votre e-mail, ni votre position, et restent dans les journaux du serveur pendant la même durée (30 jours au maximum).
        </p>
        <p>
          <strong>Comptage anonyme des utilisateurs.</strong> Pour savoir combien de personnes utilisent PAROU (et si elle est utile), nous
          comptons les ouvertures de l’application et des pages publiques du site (par exemple celle d’une ligne ou d’un arrêt) avec un nombre aléatoire enregistré dans un cookie (<em>parou_visita</em>, 13 mois).
          Ainsi, quelqu’un qui ouvre l’application plusieurs fois le même jour, ou qui revient un autre jour, compte comme la même personne.
          Sur le serveur, nous ne gardons que ce nombre (chiffré), le jour, la langue, si vous l’avez ouverte via l’application Android,
          l’application installée ou le site web, et si vous êtes arrivé par l’application ou par une page publique. Nous ne conservons ni votre IP ni votre type de navigateur, nous ne le relions pas à votre
          compte et ne le partageons avec personne. Nous seuls voyons les totaux. Si vous préférez ne pas être compté, vous pouvez le désactiver ici :
        </p>
        <PreferenciaContagem />
        <p>
          <strong>Nous n’utilisons pas</strong> de publicité, de profils d’utilisateurs, de cookies publicitaires ni d’outils d’analyse tiers.
        </p>
      </Secao>
      <Secao titulo="Base juridique">
        <p>
          La position et le compte reposent sur votre consentement (vous pouvez le retirer quand vous voulez). La copie des favoris, le comptage
          anonyme des utilisateurs, le journal de sécurité, les données techniques et les incidents publics reposent sur l’intérêt légitime de fournir, d’améliorer
          et de protéger le service que vous avez demandé (vous pouvez vous opposer au comptage à tout moment, comme indiqué ci-dessus).
        </p>
      </Secao>
      <Secao titulo="Avec qui nous partageons les données">
        <p>
          Nous ne vendons ni ne cédons de données. Nous faisons appel à ces prestataires, uniquement pour faire fonctionner PAROU : Hetzner
          (hébergement du serveur, en Allemagne, où sont aussi conservés les comptes, les incidents et la copie des favoris), les services
          de notifications de Google, d’Apple et de Mozilla (ils acheminent les notifications, si vous les activez), OpenStreetMap (votre
          navigateur télécharge les cartes directement depuis les serveurs d’OpenStreetMap, qui peuvent voir votre adresse IP) et Photon, de
          Komoot (quand vous cherchez une adresse, notre serveur ne lui envoie que le texte saisi et la zone approximative, jamais votre IP).
          Les services de notifications peuvent traiter des données hors de l’Union européenne, avec les garanties prévues par le RGPD
          (clauses contractuelles types).
        </p>
      </Secao>
      <Secao titulo="Combien de temps nous les conservons">
        <p>
          La copie des favoris et l’abonnement aux notifications sont supprimés après 13 mois sans utilisation (l’abonnement est aussi
          supprimé quand vous désactivez les notifications). Les données du compte sont conservées tant que le compte existe. Les incidents
          cessent d’être affichés après 24 heures ou quand ils sont marqués comme résolus.
        </p>
      </Secao>
      <Secao titulo="Vos droits" id="apagar-conta">
        <p>
          Vous pouvez demander l’accès, la rectification, l’effacement, la limitation et la portabilité de vos données, ou vous opposer à leur
          traitement. Pour <strong>supprimer votre compte</strong> et les données qui y sont liées : connectez-vous dans l’application, ouvrez
          votre profil (touchez votre nom, en haut à droite) et choisissez <strong>Supprimer le compte</strong>. Vous pouvez aussi le demander par
          e-mail à{' '}
          <a className="underline font-semibold" href={`mailto:${CONTACTO}?subject=Supprimer%20le%20compte%20PAROU`}>{CONTACTO}</a> ; nous répondons
          sous 30 jours. Pas à pas et ce qui est supprimé : <a className="underline font-semibold" href="/apagar-conta">Supprimer votre compte</a>. Vous pouvez aussi déposer une réclamation auprès de l’autorité portugaise de protection des données,
          la Comissão Nacional de Proteção de Dados (www.cnpd.pt).
        </p>
      </Secao>
      <Secao titulo="Enfants">
        <p>PAROU n’est pas destinée aux enfants de moins de 13 ans et ne collecte pas sciemment de données d’enfants.</p>
      </Secao>
      <Secao titulo="Modifications">
        <p>Si cette politique change, la date ci-dessus est mise à jour et, si le changement est important, nous vous le dirons dans l’application.</p>
      </Secao>
    </>
  );
}

export function TermosFr() {
  return (
    <>
      <p className="text-[13px] text-[#6B6B6B]">Dernière mise à jour : {ATUALIZADO_FR}</p>
      <Secao titulo="Le service">
        <p>
          PAROU est un service gratuit et à but non lucratif d’information sur les transports publics et la mobilité au Portugal. En
          l’utilisant, vous acceptez ces conditions.
        </p>
      </Secao>
      <Secao titulo="Informations indicatives">
        <p>
          Les horaires, heures d’arrivée, alertes et autres informations proviennent de sources publiques et tierces (opérateurs, IPMA,
          Protection civile, médias et communauté) et peuvent comporter des retards, des erreurs ou des lacunes. Elles sont indicatives :
          en cas de doute, vérifiez auprès de l’opérateur. PAROU n’est pas un service officiel d’un opérateur ni de la Protection civile —
          en cas d’urgence, appelez le 112.
        </p>
        <p>
          Nous faisons de notre mieux pour que les informations soient correctes et à jour, mais nous ne garantissons pas que le service
          soit toujours disponible et nous ne sommes pas responsables des pertes résultant de l’utilisation des informations (par exemple,
          rater un bus ou un train).
        </p>
      </Secao>
      <Secao titulo="Ce que vous publiez">
        <p>
          Les incidents, publications, réponses et commentaires que vous publiez sont publics et relèvent de votre responsabilité. Ne publiez
          pas d’informations fausses, d’insultes, de harcèlement ou de menaces, de propos haineux ou discriminatoires, de contenus
          sexuels ou violents, de photos de personnes reconnaissables ou de plaques d’immatriculation, de données personnelles d’autres
          personnes, de publicité ou de spam, ni de contenus illégaux. Ne vous faites pas passer pour une autre personne, un opérateur ou une
          organisation.
        </p>
        <p>
          Chacun peut <strong>signaler</strong> une publication, une réponse ou un incident (dans le menu de chacun) et{' '}
          <strong>bloquer</strong> un autre utilisateur pour ne plus voir ce qu’il écrit. Nous examinons les signalements et masquons ou
          supprimons les contenus qui enfreignent ces règles et, en cas d’abus répétés, suspendons le compte. Pour signaler autrement,
          écris à{' '}
          <a className="underline font-semibold" href={`mailto:${CONTACTO}`}>{CONTACTO}</a>.
        </p>
      </Secao>
      <Secao titulo="Badge Pionnier">
        <p>
          Toute personne qui crée un compte avant 23 h 59 le 31 décembre 2026 (heure de Lisbonne) reçoit automatiquement le badge
          « Pionnier », qui apparaît sur son profil. Il est gratuit, ne peut être ni acheté ni demandé après cette date, et ne donne droit
          à aucun paiement ni service. Si vous supprimez votre compte, vous perdez le badge et vous ne pouvez pas le récupérer en créant un autre
          compte après la date limite.
        </p>
      </Secao>
      <Secao titulo="Bon usage">
        <p>
          Vous ne pouvez pas essayer de perturber le service, d’accéder à des zones restreintes ni de collecter des données en masse par des
          moyens automatisés sans autorisation.
        </p>
      </Secao>
      <Secao titulo="Sources et droits">
        <p>
          Les données appartiennent à leurs sources respectives, indiquées dans l’application : opérateurs de transport (GTFS), IMT, IPMA,
          Open-Meteo, Fogos.pt et ANEPC, OpenStreetMap et les médias (les articles s’ouvrent sur le site d’origine). La marque et le
          design de PAROU appartiennent au projet PAROU.PT.
        </p>
      </Secao>
      <Secao titulo="Droit applicable">
        <p>
          Ces conditions sont régies par le droit portugais. Questions ou réclamations :{' '}
          <a className="underline font-semibold" href={`mailto:${CONTACTO}`}>{CONTACTO}</a>.
        </p>
      </Secao>
    </>
  );
}

export function ContactarFr() {
  const linha = 'flex items-center gap-3 min-h-[56px] px-4 py-2 rounded-[14px] border border-[#E6E6E3] bg-[#FFFFFF] active:bg-[#F4F4F2]';
  return (
    <>
      <p className="text-[15.5px] text-[#2B2B2B] leading-relaxed">
        PAROU est un projet fait par une seule personne, pour tout le monde. Si vous avez une question ou une suggestion, si vous avez trouvé une
        erreur, si vous voulez proposer un partenariat ou si vous êtes un opérateur et que vous voulez partager des données, parlez-moi — de n’importe
        quoi. Je réponds personnellement, en général sous quelques jours.
      </p>
      <div className="rounded-[14px] bg-[#F4F4F2] p-4 flex gap-3">
        <MessageCircle className="w-5 h-5 text-[#FF6B1A] shrink-0 mt-0.5" />
        <div className="text-[14px] text-[#111111] leading-snug">
          <div className="font-bold text-[16px]">Dinis Sousa</div>
          <div className="text-[#6B6B6B]">Auteur de PAROU.PT</div>
        </div>
      </div>
      <div className="space-y-2">
        <a href={`mailto:${CONTACTO}?subject=PAROU`} className={linha}>
          <Mail className="w-5 h-5 text-[#111111] shrink-0" />
          <span className="flex flex-col leading-tight">
            <span className="text-[12px] text-[#6B6B6B]">E-mail</span>
            <span className="text-[15px] font-semibold text-[#111111] break-all">{CONTACTO}</span>
          </span>
        </a>
        <a href={`tel:${TELEFONE_LINK}`} className={linha}>
          <Phone className="w-5 h-5 text-[#111111] shrink-0" />
          <span className="flex flex-col leading-tight">
            <span className="text-[12px] text-[#6B6B6B]">Mobile</span>
            <span className="text-[15px] font-semibold text-[#111111]">{TELEFONE}</span>
          </span>
        </a>
      </div>
      <Secao titulo="De quoi vous pouvez m’écrire">
        <p>Des erreurs dans les horaires ou les arrêts, des lignes manquantes, des suggestions d’amélioration, la presse et les partenariats, les données des opérateurs, des demandes concernant vos données (RGPD), ou simplement un mot d’encouragement.</p>
        <p>Pour les questions de confidentialité ou pour supprimer votre compte, consultez aussi la <a className="underline font-semibold" href="/privacidade">politique de confidentialité</a>.</p>
      </Secao>
    </>
  );
}

export function ApagarContaFr() {
  const botao = 'flex items-center gap-3 min-h-[56px] px-4 py-2 rounded-[14px] border border-[#E6E6E3] bg-[#FFFFFF] active:bg-[#F4F4F2]';
  return (
    <>
      <p className="text-[13px] text-[#6B6B6B]">Dernière mise à jour : {ATUALIZADO_FR}</p>
      <p>
        Cette page explique comment supprimer votre compte <strong>PAROU</strong> (l’application Android PAROU et le site parou.pt) et les
        données qui y sont liées. Vous n’avez pas besoin de compte pour utiliser PAROU : si vous n’en avez jamais créé, il n’y a rien à supprimer.
      </p>
      <ApagarAqui />
      <Secao titulo="Comment supprimer votre compte">
        <p><strong>1. Dans l’application ou sur le site (immédiat).</strong></p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Connectez-vous à votre compte PAROU.</li>
          <li>Touchez votre nom, en haut à droite, pour ouvrir votre profil.</li>
          <li>Faites défiler jusqu’en bas et touchez <strong>Supprimer le compte</strong>.</li>
          <li>Saisissez votre mot de passe et confirmez avec <strong>Oui, supprimer le compte</strong>.</li>
        </ol>
        <p>Le compte et les données qui y sont liées sont supprimés immédiatement.</p>
        <p><strong>2. Par e-mail</strong>, si vous n’avez plus l’application ou si vous avez oublié votre mot de passe.</p>
        <a href={`mailto:${CONTACTO}?subject=Supprimer%20le%20compte%20PAROU&body=Je%20souhaite%20supprimer%20mon%20compte%20PAROU.%20L%E2%80%99e-mail%20du%20compte%20est%C2%A0%3A%20`} className={botao}>
          <Mail className="w-5 h-5 text-[#111111] shrink-0" />
          <span className="flex flex-col leading-tight">
            <span className="text-[12px] text-[#6B6B6B]">Demander par e-mail</span>
            <span className="text-[15px] font-semibold text-[#111111] break-all">{CONTACTO}</span>
          </span>
        </a>
        <p>
          Écrivez depuis l’e-mail utilisé pour créer le compte (ou indiquez-nous lequel c’est). Nous vérifions que c’est bien vous et
          supprimons le compte sous 30 jours, en général bien plus vite.
        </p>
      </Secao>
      <Secao titulo="Ce qui est supprimé">
        <ul className="list-disc pl-5 space-y-1">
          <li>Votre nom et votre e-mail.</li>
          <li>Votre mot de passe (nous n’en gardons qu’une version brouillée à sens unique, jamais le mot de passe lui-même).</li>
          <li>Votre avatar, vos points et vos badges.</li>
          <li>Les favoris synchronisés avec le compte.</li>
          <li>Les sessions sur tous les appareils et les demandes de récupération du mot de passe.</li>
          <li>Vos votes, vos signalements et la liste des personnes que vous avez bloquées.</li>
        </ul>
      </Secao>
      <Secao titulo="Ce qui reste">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Les incidents, publications, réponses et commentaires que vous avez écrits restent visibles pour aider les autres, mais sous le nom{' '}
            <strong>« Utilisateur PAROU »</strong>, sans lien avec votre compte. Si vous préférez, supprimez-les vous-même avant de supprimer le
            compte, ou demandez-nous par e-mail de les retirer.
          </li>
          <li>Les journaux techniques du serveur (adresse IP et type de navigateur, pour la sécurité) sont supprimés automatiquement après 30 jours.</li>
          <li>Le comptage anonyme des utilisateurs n’est pas lié à votre compte.</li>
        </ul>
        <p>Une fois supprimé, le compte ne peut pas être récupéré. Vous pouvez en créer un nouveau quand vous voulez.</p>
      </Secao>
      <Secao titulo="Plus d’informations">
        <p>
          Lisez la <a className="underline font-semibold" href="/privacidade">politique de confidentialité</a> pour savoir quelles données PAROU utilise et quels sont vos
          droits, ou <a className="underline font-semibold" href="/contactar">contactez-nous</a>.
        </p>
      </Secao>
    </>
  );
}

/** Escolhe a página (carregada só quando o idioma é francês) */
export default function PaginaFr({ pagina, onAbrir }: { pagina: PaginaInfo; onAbrir: (p: PaginaInfo) => void }) {
  return pagina === 'sobre' ? <SobreFr onAbrir={onAbrir} />
    : pagina === 'privacidade' ? <PrivacidadeFr />
    : pagina === 'contactar' ? <ContactarFr />
    : pagina === 'apagar-conta' ? <ApagarContaFr />
    : <TermosFr />;
}
