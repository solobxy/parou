// Versão inglesa das páginas Sobre, Privacidade, Termos e Contactar (mesma estrutura das portuguesas).
import React from 'react';
import { Mail, Heart, ShieldCheck, FileText, Phone, MessageCircle } from 'lucide-react';
import type { PaginaInfo } from './PaginaInformativa';
import { CONTACTO, TELEFONE, TELEFONE_LINK, Secao, PreferenciaContagem, ApagarAqui } from './paginasInfoBase';

const ATUALIZADO_EN = '11 October 2026';

export function SobreEn({ onAbrir }: { onAbrir: (p: PaginaInfo) => void }) {
  return (
    <>
      <p className="text-[15.5px] text-[#2B2B2B] leading-relaxed">
        PAROU shows you, in one place, what is running near you — buses, metro, trains and boats — with the expected arrival time,
        timetables from the main operators, strikes, weather warnings, wildfires and whatever else affects your journeys in Portugal.
      </p>
      <div className="rounded-[14px] bg-[#F4F4F2] p-4 flex gap-3">
        <Heart className="w-5 h-5 text-[#FF6B1A] shrink-0 mt-0.5" />
        <p className="text-[14px] text-[#111111] leading-snug">
          <strong>Free and non-profit.</strong> No ads, no subscriptions and no selling of data. Made for citizens.
        </p>
      </div>
      <Secao titulo="Where the data comes from">
        <p>
          Official timetables (GTFS) published by the operators and by the National Access Point (IMT), real-time data where
          operators provide it (for example Carris Metropolitana and STCP), warnings and forecasts from IPMA and Open-Meteo,
          wildfires and incidents from Civil Protection through Fogos.pt (ANEPC data), disruptions announced by the operators and
          news from Portuguese media. Maps © OpenStreetMap contributors.
        </p>
        <p>
          Where there is no real-time data, the time shown is the official timetable time. Timetables are updated every day.
        </p>
      </Secao>
      <Secao titulo="Contact">
        <p>
          Found a mistake, a line is missing, or are you an operator who wants to share data? Write to us:
        </p>
        <a href={`mailto:${CONTACTO}?subject=PAROU`} className="inline-flex items-center gap-2 h-11 px-4 rounded-[12px] bg-[#111111] text-[#FFFFFF] font-semibold text-[14px]">
          <Mail className="w-4 h-4" /> {CONTACTO}
        </a>
        <p>
          <button onClick={() => onAbrir('contactar')} className="underline font-semibold cursor-pointer">See all contact details</button>
        </p>
      </Secao>
      <div className="grid grid-cols-2 gap-2 pt-2">
        <button onClick={() => onAbrir('privacidade')} className="h-12 rounded-[12px] border border-[#E6E6E3] text-[14px] font-semibold text-[#111111] flex items-center justify-center gap-2 cursor-pointer">
          <ShieldCheck className="w-4 h-4" /> Privacy
        </button>
        <button onClick={() => onAbrir('termos')} className="h-12 rounded-[12px] border border-[#E6E6E3] text-[14px] font-semibold text-[#111111] flex items-center justify-center gap-2 cursor-pointer">
          <FileText className="w-4 h-4" /> Terms
        </button>
      </div>
    </>
  );
}

export function PrivacidadeEn() {
  return (
    <>
      <p className="text-[13px] text-[#6B6B6B]">Last updated: {ATUALIZADO_EN}</p>
      <p>
        This policy explains what data PAROU (parou.pt and the PAROU app) uses, what for, and what your rights are under the
        General Data Protection Regulation (GDPR). We use as little as possible: most of the app works without an account and
        without knowing who you are.
      </p>
      <Secao titulo="Who is responsible">
        <p>
          PAROU.PT, a project by Dinis Sousa. Contact for any privacy question:{' '}
          <a className="underline font-semibold" href={`mailto:${CONTACTO}`}>{CONTACTO}</a>.
        </p>
      </Secao>
      <Secao titulo="What data we use and why">
        <p>
          <strong>Location (only if you allow it).</strong> It is used to show the stops and services near you. Your position is
          sent to our server only to work out the nearby stops and is not stored on the server. Your last position stays on your
          phone, for up to 12 hours, so the app opens in the right place. You can withdraw permission at any time in your browser
          or phone settings.
        </p>
        <p>
          <strong>Favourites and preferences.</strong> They are stored on your phone. So they are not lost (some browsers delete
          this data), we keep a copy on the server linked to a random identifier in a technical cookie
          (<em>parou_id</em>). This identifier does not say who you are and is not used for anything else.
        </p>
        <p>
          <strong>Notifications (only if you turn them on).</strong> We store the delivery address your browser gives us (from the
          Google, Apple or Mozilla notification service) and the districts you chose, so we can send you alerts about strikes, bad
          weather and serious disruptions. The content of notifications is encrypted. When you turn notifications off, this data is
          deleted.
        </p>
        <p>
          <strong>Account (optional).</strong> If you create an account, we store your name, your email and an encrypted version of
          your password (never the password itself) on our server, to sync favourites between devices and to identify the incidents
          you post. When you sign in, we store a technical session cookie on your phone (<em>parou_sessao</em>, 30 days) so you do
          not have to sign in every time. Your email is never shown to other people.
        </p>
        <p>
          <strong>Incidents and comments you post.</strong> They are public (title, description, place, time, the photo if you add
          one, and the name you choose to show), because the purpose is to warn other people. The photo is optional and is only
          sent if you choose it; please do not include recognisable people or number plates.
        </p>
        <p>
          <strong>Technical data.</strong> As on any website, the server receives the IP address and the browser type in order to
          deliver the pages and protect the service from abuse. We do not use them to identify you and do not keep them longer than
          necessary (30 days at most in the server logs).
        </p>
        <p>
          <strong>Error reports.</strong> If the app crashes, it sends us the technical error text, the page where it happened and the
          browser or phone type, so we can fix it. It does not include your name, email or location, and it stays in the server logs
          for the same period (30 days at most).
        </p>
        <p>
          <strong>Anonymous user count.</strong> To know how many people use PAROU (and whether it is needed), we count opens of the app and of the
          public pages of the website (for example, a line or stop page) with a random number stored in a cookie (<em>parou_visita</em>, 13 months). This way, someone who opens the app many
          times on the same day, or comes back on another day, counts as the same person. On the server we keep only that number
          (encrypted), the day, the language, whether you opened it through the Android app, the installed app or the website, and whether you arrived through the app or a public page.
          We do not store your IP or browser type, we do not link this to your account and we do not share it with anyone. Only we
          see the totals. If you prefer not to be counted, you can switch it off here:
        </p>
        <PreferenciaContagem />
        <p>
          <strong>We do not use</strong> advertising, user profiles, advertising cookies or third-party analytics tools.
        </p>
      </Secao>
      <Secao titulo="Legal basis">
        <p>
          Location and the account are based on your consent (you can withdraw it whenever you want). The favourites copy, the
          anonymous user count, technical data and public incidents are based on the legitimate interest in providing, improving
          and protecting the service you asked for (you can object to the count at any time, as above).
        </p>
      </Secao>
      <Secao titulo="Who we share it with">
        <p>
          We do not sell or hand over data. We use these providers, only to run PAROU: Hetzner (server hosting, in Germany, where
          accounts, incidents and the favourites copy are also stored), the Google, Apple and Mozilla notification services (they
          deliver notifications, if you turn them on), OpenStreetMap (your browser downloads maps directly from OpenStreetMap
          servers, which can see your IP address) and Photon, by Komoot (when you search for an address, our server sends it only
          the text you typed and the approximate area, never your IP). The notification services may process data outside the
          European Union, with the safeguards provided for in the GDPR (standard contractual clauses).
        </p>
      </Secao>
      <Secao titulo="How long we keep it">
        <p>
          The favourites copy and the notification subscription are deleted after 13 months without use (the subscription is also
          deleted when you turn notifications off). Account data is kept as long as the account exists. Incidents stop being shown
          after 24 hours or when they are marked as resolved.
        </p>
      </Secao>
      <Secao titulo="Your rights" id="apagar-conta">
        <p>
          You can ask for access, correction, erasure, restriction, portability, or object to the processing of your data. To{' '}
          <strong>delete your account</strong> and the data linked to it: sign in to the app, open your profile (tap your name, in
          the top right corner) and choose <strong>Delete account</strong>. You can also ask by email at{' '}
          <a className="underline font-semibold" href={`mailto:${CONTACTO}?subject=Delete%20PAROU%20account`}>{CONTACTO}</a>; we reply
          within 30 days. Step by step and what is deleted: <a className="underline font-semibold" href="/apagar-conta">Delete your account</a>. You can also lodge a complaint with the Portuguese data protection authority, the Comissão Nacional de
          Proteção de Dados (www.cnpd.pt).
        </p>
      </Secao>
      <Secao titulo="Children">
        <p>PAROU is not intended for children under 13 and does not knowingly collect data from children.</p>
      </Secao>
      <Secao titulo="Changes">
        <p>If this policy changes, the date above is updated and, if the change is important, we will tell you in the app.</p>
      </Secao>
    </>
  );
}

export function TermosEn() {
  return (
    <>
      <p className="text-[13px] text-[#6B6B6B]">Last updated: {ATUALIZADO_EN}</p>
      <Secao titulo="The service">
        <p>
          PAROU is a free, non-profit service providing information about public transport and mobility in Portugal. By using it
          you accept these terms.
        </p>
      </Secao>
      <Secao titulo="Indicative information">
        <p>
          Timetables, arrival times, alerts and other information come from public and third-party sources (operators, IPMA, Civil
          Protection, the media and the community) and may contain delays, errors or gaps. They are indicative: if in doubt, check
          with the operator. PAROU is not an official service of any operator or of Civil Protection — in an emergency, call 112.
        </p>
        <p>
          We do our best to keep the information correct and up to date, but we do not guarantee that the service is always
          available and we are not liable for losses resulting from the use of the information (for example, missing a service).
        </p>
      </Secao>
      <Secao titulo="What you post">
        <p>
          The incidents, posts, replies and comments you post are public and your responsibility. Do not post false information,
          insults, harassment or threats, hate speech or discrimination, sexual or violent content, photos of recognisable people
          or number plates, other people's personal data, advertising or spam, or illegal content. Do not pretend to be another
          person, operator or organisation.
        </p>
        <p>
          Anyone can <strong>report</strong> a post, reply or incident (in the menu of each one) and <strong>block</strong>{' '}
          another user to stop seeing what they write. We review reports and hide or delete content that breaks these rules and,
          in case of repeated abuse, suspend the account. To report in another way, write to{' '}
          <a className="underline font-semibold" href={`mailto:${CONTACTO}`}>{CONTACTO}</a>.
        </p>
      </Secao>
      <Secao titulo="Pioneer badge">
        <p>
          Anyone who creates an account by 23:59 on 31 December 2026 (Lisbon time) automatically receives the "Pioneer" badge, which
          appears on their profile. It is free, cannot be bought or requested after that date, and gives no right to payments or
          services. If you delete your account, you lose the badge and cannot get it back by creating another account after the
          deadline.
        </p>
      </Secao>
      <Secao titulo="Proper use">
        <p>
          You may not try to disrupt the service, access restricted areas, or collect data in bulk by automated means without
          permission.
        </p>
      </Secao>
      <Secao titulo="Sources and rights">
        <p>
          The data belongs to its respective sources, which are indicated in the app: transport operators (GTFS), IMT, IPMA,
          Open-Meteo, Fogos.pt and ANEPC, OpenStreetMap and the media (news opens on the original site). The PAROU brand and design
          belong to the PAROU.PT project.
        </p>
      </Secao>
      <Secao titulo="Governing law">
        <p>
          These terms are governed by Portuguese law. Questions or complaints:{' '}
          <a className="underline font-semibold" href={`mailto:${CONTACTO}`}>{CONTACTO}</a>.
        </p>
      </Secao>
    </>
  );
}

export function ContactarEn() {
  const linha = 'flex items-center gap-3 min-h-[56px] px-4 py-2 rounded-[14px] border border-[#E6E6E3] bg-[#FFFFFF] active:bg-[#F4F4F2]';
  return (
    <>
      <p className="text-[15.5px] text-[#2B2B2B] leading-relaxed">
        PAROU is a project made by one person, for everyone. If you have a question or a suggestion, found a mistake, want to
        propose a partnership, or are an operator who wants to share data, talk to me — about anything at all. I reply personally,
        usually within a few days.
      </p>
      <div className="rounded-[14px] bg-[#F4F4F2] p-4 flex gap-3">
        <MessageCircle className="w-5 h-5 text-[#FF6B1A] shrink-0 mt-0.5" />
        <div className="text-[14px] text-[#111111] leading-snug">
          <div className="font-bold text-[16px]">Dinis Sousa</div>
          <div className="text-[#6B6B6B]">Author of PAROU.PT</div>
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
            <span className="text-[12px] text-[#6B6B6B]">Mobile</span>
            <span className="text-[15px] font-semibold text-[#111111]">{TELEFONE}</span>
          </span>
        </a>
      </div>
      <Secao titulo="What you can write to me about">
        <p>Mistakes in timetables or stops, missing lines, suggestions for improvement, press and partnerships, operator data, requests about your data (GDPR), or simply a word of help.</p>
        <p>For privacy questions or to delete your account, see also the <a className="underline font-semibold" href="/privacidade">privacy policy</a>.</p>
      </Secao>
    </>
  );
}

export function ApagarContaEn() {
  const botao = 'flex items-center gap-3 min-h-[56px] px-4 py-2 rounded-[14px] border border-[#E6E6E3] bg-[#FFFFFF] active:bg-[#F4F4F2]';
  return (
    <>
      <p className="text-[13px] text-[#6B6B6B]">Last updated: {ATUALIZADO_EN}</p>
      <p>
        This page explains how to delete your <strong>PAROU</strong> account (the PAROU Android app and the parou.pt website) and
        the data linked to it. You do not need an account to use PAROU: if you never created one, there is nothing to delete.
      </p>
      <ApagarAqui />
      <Secao titulo="How to delete your account">
        <p><strong>1. In the app or on the website (immediate).</strong></p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Sign in to your PAROU account.</li>
          <li>Tap your name, in the top right corner, to open your profile.</li>
          <li>Scroll to the bottom and tap <strong>Delete account</strong>.</li>
          <li>Enter your password and confirm with <strong>Yes, delete the account</strong>.</li>
        </ol>
        <p>The account and the data linked to it are deleted right away.</p>
        <p><strong>2. By email</strong>, if you no longer have the app or forgot your password.</p>
        <a href={`mailto:${CONTACTO}?subject=Delete%20PAROU%20account&body=I%20want%20to%20delete%20my%20PAROU%20account.%20The%20account%20email%20is%3A%20`} className={botao}>
          <Mail className="w-5 h-5 text-[#111111] shrink-0" />
          <span className="flex flex-col leading-tight">
            <span className="text-[12px] text-[#6B6B6B]">Ask by email</span>
            <span className="text-[15px] font-semibold text-[#111111] break-all">{CONTACTO}</span>
          </span>
        </a>
        <p>
          Write from the email you used to create the account (or tell us which one it is). We confirm it is you and delete the
          account within 30 days, usually much sooner.
        </p>
      </Secao>
      <Secao titulo="What is deleted">
        <ul className="list-disc pl-5 space-y-1">
          <li>Your name and your email.</li>
          <li>Your password (we only keep a one-way scrambled version of it, never the password itself).</li>
          <li>Your avatar, points and badges.</li>
          <li>Favourites synced with the account.</li>
          <li>Sessions on all devices and password recovery requests.</li>
          <li>Your votes, reports and the list of people you blocked.</li>
        </ul>
      </Secao>
      <Secao titulo="What stays">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Incidents, posts, replies and comments you wrote stay visible to help other people, but as{' '}
            <strong>“PAROU user”</strong>, with no link to your account. If you prefer, delete them yourself before deleting
            the account, or ask us by email to remove them.
          </li>
          <li>Technical server logs (IP address and browser type, for security) are deleted automatically after 30 days.</li>
          <li>The anonymous user count is not linked to your account.</li>
        </ul>
        <p>Once deleted, the account cannot be recovered. You can create a new one whenever you like.</p>
      </Secao>
      <Secao titulo="More information">
        <p>
          Read the <a className="underline font-semibold" href="/privacidade">privacy policy</a> to see what data PAROU uses and what
          your rights are, or <a className="underline font-semibold" href="/contactar">contact us</a>.
        </p>
      </Secao>
    </>
  );
}
