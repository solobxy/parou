// Deutsche Version der Seiten Über uns, Datenschutz, Nutzungsbedingungen, Kontakt und Konto löschen (gleiche Struktur wie die portugiesischen und englischen).
import React from 'react';
import { Mail, Heart, ShieldCheck, FileText, Phone, MessageCircle } from 'lucide-react';
import type { PaginaInfo } from './PaginaInformativa';
import { CONTACTO, TELEFONE, TELEFONE_LINK, Secao, PreferenciaContagem, ApagarAqui } from './paginasInfoBase';

const ATUALIZADO_DE = '15. Oktober 2026';

export function SobreDe({ onAbrir }: { onAbrir: (p: PaginaInfo) => void }) {
  return (
    <>
      <p className="text-[15.5px] text-[#2B2B2B] leading-relaxed">
        PAROU zeigt dir an einem Ort, was in deiner Nähe fährt – Busse, U-Bahn, Züge und Fähren – mit der voraussichtlichen Ankunftszeit,
        den Fahrplänen der wichtigsten Verkehrsunternehmen, Streiks, Wetterwarnungen, Waldbränden und allem, was deine Fahrten
        in Portugal betrifft.
      </p>
      <div className="rounded-[14px] bg-[#F4F4F2] p-4 flex gap-3">
        <Heart className="w-5 h-5 text-[#FF6B1A] shrink-0 mt-0.5" />
        <p className="text-[14px] text-[#111111] leading-snug">
          <strong>Kostenlos und gemeinnützig.</strong> Keine Werbung, keine Abos und kein Verkauf von Daten. Gemacht für die Bürgerinnen und Bürger.
        </p>
      </div>
      <Secao titulo="Woher die Daten stammen">
        <p>
          Offizielle Fahrpläne (GTFS), veröffentlicht von den Verkehrsunternehmen und vom Nationalen Zugangspunkt (IMT), Echtzeitdaten,
          wo die Unternehmen sie bereitstellen (zum Beispiel Carris Metropolitana und STCP), Warnungen und Vorhersagen von IPMA und
          Open-Meteo, Waldbrände und Einsätze des Zivilschutzes über Fogos.pt (Daten der ANEPC), von den Unternehmen angekündigte
          Störungen sowie Nachrichten der portugiesischen Medien. Karten © OpenStreetMap-Mitwirkende.
        </p>
        <p>
          Wo es keine Echtzeitdaten gibt, ist die angezeigte Zeit die offizielle Fahrplanzeit. Die Fahrpläne werden täglich aktualisiert.
        </p>
      </Secao>
      <Secao titulo="Kontakt">
        <p>
          Hast du einen Fehler gefunden, fehlt eine Linie, oder bist du ein Verkehrsunternehmen und möchtest Daten teilen? Schreib uns:
        </p>
        <a href={`mailto:${CONTACTO}?subject=PAROU`} className="inline-flex items-center gap-2 h-11 px-4 rounded-[12px] bg-[#111111] text-[#FFFFFF] font-semibold text-[14px]">
          <Mail className="w-4 h-4" /> {CONTACTO}
        </a>
        <p>
          <button onClick={() => onAbrir('contactar')} className="underline font-semibold cursor-pointer">Alle Kontaktdaten ansehen</button>
        </p>
      </Secao>
      <div className="grid grid-cols-2 gap-2 pt-2">
        <button onClick={() => onAbrir('privacidade')} className="h-12 rounded-[12px] border border-[#E6E6E3] text-[14px] font-semibold text-[#111111] flex items-center justify-center gap-2 cursor-pointer">
          <ShieldCheck className="w-4 h-4" /> Datenschutz
        </button>
        <button onClick={() => onAbrir('termos')} className="h-12 rounded-[12px] border border-[#E6E6E3] text-[14px] font-semibold text-[#111111] flex items-center justify-center gap-2 cursor-pointer">
          <FileText className="w-4 h-4" /> Nutzungsbedingungen
        </button>
      </div>
    </>
  );
}

export function PrivacidadeDe() {
  return (
    <>
      <p className="text-[13px] text-[#6B6B6B]">Zuletzt aktualisiert: {ATUALIZADO_DE}</p>
      <p>
        Diese Erklärung beschreibt, welche Daten PAROU (parou.pt und die PAROU-App) verwendet, wofür und welche Rechte du nach der
        Datenschutz-Grundverordnung (DSGVO) hast. Wir verwenden so wenig wie möglich: Der größte Teil der App funktioniert ohne Konto
        und ohne dass wir wissen, wer du bist.
      </p>
      <Secao titulo="Wer verantwortlich ist">
        <p>
          PAROU.PT, ein Projekt von Dinis Sousa. Kontakt bei allen Datenschutzfragen:{' '}
          <a className="underline font-semibold" href={`mailto:${CONTACTO}`}>{CONTACTO}</a>.
        </p>
      </Secao>
      <Secao titulo="Welche Daten wir verwenden und wofür">
        <p>
          <strong>Standort (nur wenn du ihn erlaubst).</strong> Er dient dazu, die Haltestellen und Verbindungen in deiner Nähe anzuzeigen.
          Deine Position wird nur an unseren Server gesendet, um die nahen Haltestellen zu berechnen, und dort nicht gespeichert. Deine
          letzte Position bleibt bis zu 12 Stunden auf deinem Telefon, damit sich die App am richtigen Ort öffnet. Solange der Standort an
          ist, liest die App außerdem den Bewegungssensor deines Telefons, nur auf dem Gerät, um zu erkennen, ob du stillstehst, und den
          Punkt auf der Karte nicht zittern zu lassen; diese Werte werden weder gespeichert noch gesendet. Du kannst die Erlaubnis
          jederzeit in den Einstellungen deines Browsers oder Telefons widerrufen.
        </p>
        <p>
          <strong>Favoriten und Einstellungen.</strong> Sie werden auf deinem Telefon gespeichert. Damit sie nicht verloren gehen (manche
          Browser löschen diese Daten), halten wir eine Kopie auf dem Server vor, verknüpft mit einer zufälligen Kennung in einem
          technischen Cookie (<em>parou_id</em>). Diese Kennung sagt nichts darüber aus, wer du bist, und wird für nichts anderes verwendet.
        </p>
        <p>
          <strong>Benachrichtigungen (nur wenn du sie einschaltest).</strong> Wir speichern die Zustelladresse, die uns dein Browser gibt
          (vom Benachrichtigungsdienst von Google, Apple oder Mozilla), und die Bezirke, die du gewählt hast, damit wir dir Warnungen
          über Streiks, schlechtes Wetter und schwere Störungen senden können. Der Inhalt der Benachrichtigungen ist verschlüsselt. Wenn
          du Benachrichtigungen ausschaltest, werden diese Daten gelöscht.
        </p>
        <p>
          <strong>Konto (optional).</strong> Wenn du ein Konto erstellst, speichern wir deinen Namen, deine E-Mail-Adresse und eine
          verschlüsselte Version deines Passworts (niemals das Passwort selbst) auf unserem Server, um Favoriten zwischen Geräten zu
          synchronisieren und die von dir gemeldeten Vorfälle zuzuordnen. Wenn du dich anmeldest, speichern wir auf deinem Telefon ein
          technisches Sitzungs-Cookie (<em>parou_sessao</em>, 30 Tage), damit du dich nicht jedes Mal neu anmelden musst. Deine
          E-Mail-Adresse wird anderen Personen nie angezeigt. Außerdem speichern wir die App-Sprache sowie Datum und Uhrzeit der letzten
          Nutzung des Kontos; diese sieht nur die Verwaltung von PAROU.
        </p>
        <p>
          <strong>Vorfälle und Kommentare, die du veröffentlichst.</strong> Sie sind öffentlich (Titel, Beschreibung, Ort, Uhrzeit, das Foto,
          falls du eines hinzufügst, und der Name, den du anzeigen lässt), denn ihr Zweck ist es, andere zu warnen. Das Foto ist optional
          und wird nur gesendet, wenn du es auswählst; bitte keine erkennbaren Personen oder Kfz-Kennzeichen aufnehmen.
        </p>
        <p>
          <strong>Technische Daten.</strong> Wie bei jeder Website erhält der Server die IP-Adresse und den Browsertyp, um die Seiten
          auszuliefern und den Dienst vor Missbrauch zu schützen. Wir verwenden sie nicht, um dich zu identifizieren, und bewahren sie
          nicht länger als nötig auf (höchstens 30 Tage in den Server-Protokollen).
        </p>
        <p>
          <strong>Sicherheitsprotokoll.</strong> Um PAROU vor Angriffen und Missbrauch zu schützen, protokolliert der Server nur
          <em>verdächtige Ereignisse</em> (zum Beispiel Versuche, ohne Schlüssel auf die Verwaltung zuzugreifen, wiederholt falsche Passwörter,
          übermäßig viele Anfragen oder interne Fehler), nicht jeden Besuch. Gespeichert werden die Art des Ereignisses, die Stunde, die Route
          (ohne das, was du eingegeben hast) und ein aus deiner IP-Adresse berechneter Code, der sich täglich ändert und dich daher nicht
          von einem Tag zum nächsten verfolgen lässt. Nicht gespeichert werden die IP-Adresse im Klartext, Cookies, Passwörter, E-Mails oder
          dein Standort. Das Protokoll löscht sich nach 30 Tagen selbst.
        </p>
        <p>
          <strong>Fehlerberichte.</strong> Wenn die App abstürzt, sendet sie uns den technischen Fehlertext, die Seite, auf der es passiert
          ist, und den Browser- oder Telefontyp, damit wir den Fehler beheben können. Sie enthalten weder deinen Namen noch deine
          E-Mail-Adresse oder deinen Standort und bleiben im selben Zeitraum in den Server-Protokollen (höchstens 30 Tage).
        </p>
        <p>
          <strong>Anonyme Nutzerzählung.</strong> Um zu wissen, wie viele Menschen PAROU nutzen (und ob es gebraucht wird), zählen wir
          Aufrufe der App und der öffentlichen Seiten der Website (zum Beispiel einer Linien- oder Haltestellenseite) mit einer zufälligen Zahl, die in einem Cookie gespeichert ist (<em>parou_visita</em>, 13 Monate). So zählt jemand,
          der die App am selben Tag mehrmals öffnet oder an einem anderen Tag wiederkommt, als dieselbe Person. Auf dem Server speichern wir
          nur diese Zahl (verschlüsselt), den Tag, die Sprache, ob du die App über Android, als installierte App oder über die Website
          geöffnet hast, und ob du über die App oder eine öffentliche Seite gekommen bist. Wir speichern weder deine IP-Adresse noch deinen Browsertyp, verknüpfen das nicht mit deinem Konto und geben es an
          niemanden weiter. Nur wir sehen die Summen. Wenn du lieber nicht gezählt werden möchtest, kannst du das hier ausschalten:
        </p>
        <PreferenciaContagem />
        <p>
          <strong>Wir verwenden keine</strong> Werbung, Nutzerprofile, Werbe-Cookies oder Analysewerkzeuge von Dritten.
        </p>
      </Secao>
      <Secao titulo="Rechtsgrundlage">
        <p>
          Standort und Konto beruhen auf deiner Einwilligung (du kannst sie jederzeit widerrufen). Die Favoriten-Kopie, die anonyme
          Nutzerzählung, das Sicherheitsprotokoll, technische Daten und öffentliche Vorfälle beruhen auf dem berechtigten Interesse, den von dir gewünschten Dienst
          bereitzustellen, zu verbessern und zu schützen (der Zählung kannst du jederzeit widersprechen, wie oben beschrieben).
        </p>
      </Secao>
      <Secao titulo="An wen wir Daten weitergeben">
        <p>
          Wir verkaufen keine Daten und geben sie nicht weiter. Wir nutzen diese Dienstleister, nur um PAROU zu betreiben: Hetzner
          (Server-Hosting in Deutschland, wo auch Konten, Vorfälle und die Favoriten-Kopie gespeichert werden), die
          Benachrichtigungsdienste von Google, Apple und Mozilla (sie stellen Benachrichtigungen zu, wenn du sie einschaltest),
          OpenStreetMap (dein Browser lädt Karten direkt von den OpenStreetMap-Servern, die deine IP-Adresse sehen können) und Photon von
          Komoot (wenn du nach einer Adresse suchst, sendet unser Server nur den eingegebenen Text und das ungefähre Gebiet, niemals deine
          IP-Adresse). Die Benachrichtigungsdienste können Daten außerhalb der Europäischen Union verarbeiten, mit den in der DSGVO
          vorgesehenen Garantien (Standardvertragsklauseln).
        </p>
      </Secao>
      <Secao titulo="Wie lange wir sie aufbewahren">
        <p>
          Die Favoriten-Kopie und das Benachrichtigungs-Abonnement werden nach 13 Monaten ohne Nutzung gelöscht (das Abonnement wird auch
          gelöscht, wenn du Benachrichtigungen ausschaltest). Kontodaten werden aufbewahrt, solange das Konto besteht. Vorfälle werden nach
          24 Stunden oder wenn sie als erledigt markiert sind nicht mehr angezeigt.
        </p>
      </Secao>
      <Secao titulo="Deine Rechte" id="apagar-conta">
        <p>
          Du kannst Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Übertragbarkeit verlangen oder der Verarbeitung
          deiner Daten widersprechen. Um dein <strong>Konto zu löschen</strong> und die damit verknüpften Daten: Melde dich in der App an,
          öffne dein Profil (tippe oben rechts auf deinen Namen) und wähle <strong>Konto löschen</strong>. Du kannst auch per E-Mail an{' '}
          <a className="underline font-semibold" href={`mailto:${CONTACTO}?subject=PAROU-Konto%20l%C3%B6schen`}>{CONTACTO}</a> darum bitten; wir antworten
          innerhalb von 30 Tagen. Schritt für Schritt und was gelöscht wird: <a className="underline font-semibold" href="/apagar-conta">Konto löschen</a>. Du kannst dich außerdem bei der portugiesischen Datenschutzbehörde beschweren,
          der Comissão Nacional de Proteção de Dados (www.cnpd.pt).
        </p>
      </Secao>
      <Secao titulo="Kinder">
        <p>PAROU richtet sich nicht an Kinder unter 13 Jahren und erhebt wissentlich keine Daten von Kindern.</p>
      </Secao>
      <Secao titulo="Änderungen">
        <p>Wenn sich diese Erklärung ändert, wird das obige Datum aktualisiert und, wenn die Änderung wichtig ist, informieren wir dich in der App.</p>
      </Secao>
    </>
  );
}

export function TermosDe() {
  return (
    <>
      <p className="text-[13px] text-[#6B6B6B]">Zuletzt aktualisiert: {ATUALIZADO_DE}</p>
      <Secao titulo="Der Dienst">
        <p>
          PAROU ist ein kostenloser, gemeinnütziger Dienst mit Informationen zu öffentlichem Verkehr und Mobilität in Portugal. Mit der
          Nutzung akzeptierst du diese Bedingungen.
        </p>
      </Secao>
      <Secao titulo="Unverbindliche Informationen">
        <p>
          Fahrpläne, Ankunftszeiten, Warnungen und andere Informationen stammen aus öffentlichen Quellen und Quellen Dritter
          (Verkehrsunternehmen, IPMA, Zivilschutz, Medien und die Community) und können Verzögerungen, Fehler oder Lücken enthalten. Sie
          sind unverbindlich: Frag im Zweifel beim Verkehrsunternehmen nach. PAROU ist kein offizieller Dienst eines Verkehrsunternehmens
          oder des Zivilschutzes – im Notfall wähle die 112.
        </p>
        <p>
          Wir bemühen uns, die Informationen richtig und aktuell zu halten, garantieren aber nicht, dass der Dienst immer verfügbar ist,
          und haften nicht für Schäden aus der Nutzung der Informationen (zum Beispiel einen verpassten Bus oder Zug).
        </p>
      </Secao>
      <Secao titulo="Was du veröffentlichst">
        <p>
          Die Vorfälle, Beiträge, Antworten und Kommentare, die du veröffentlichst, sind öffentlich und liegen in deiner Verantwortung.
          Veröffentliche keine falschen Informationen, Beleidigungen, Belästigung oder Drohungen, Hassrede oder Diskriminierung,
          sexuelle oder gewalttätige Inhalte, Fotos von erkennbaren Personen oder Kfz-Kennzeichen, personenbezogene Daten anderer, Werbung
          oder Spam und keine rechtswidrigen Inhalte. Gib dich nicht als eine andere Person, ein Verkehrsunternehmen oder eine
          Organisation aus.
        </p>
        <p>
          Jede Person kann einen Beitrag, eine Antwort oder einen Vorfall <strong>melden</strong> (im Menü des jeweiligen Eintrags) und
          andere Nutzerinnen und Nutzer <strong>blockieren</strong>, um nicht mehr zu sehen, was sie schreiben. Wir prüfen Meldungen und
          blenden Inhalte, die gegen diese Regeln verstoßen, aus oder löschen sie und sperren bei wiederholtem Missbrauch das Konto. Um auf
          anderem Weg zu melden, schreib an{' '}
          <a className="underline font-semibold" href={`mailto:${CONTACTO}`}>{CONTACTO}</a>.
        </p>
      </Secao>
      <Secao titulo="Pionier-Abzeichen">
        <p>
          Wer bis 23:59 Uhr am 31. Dezember 2026 (Lissabonner Zeit) ein Konto erstellt, erhält automatisch das Abzeichen „Pionier“, das im
          Profil erscheint. Es ist kostenlos, kann nach diesem Datum weder gekauft noch beantragt werden und begründet keinen Anspruch auf
          Zahlungen oder Leistungen. Wenn du dein Konto löschst, verlierst du das Abzeichen und kannst es nach Fristende nicht durch ein
          neues Konto zurückerhalten.
        </p>
      </Secao>
      <Secao titulo="Ordnungsgemäße Nutzung">
        <p>
          Du darfst nicht versuchen, den Dienst zu stören, auf geschützte Bereiche zuzugreifen oder ohne Erlaubnis automatisiert große
          Datenmengen abzurufen.
        </p>
      </Secao>
      <Secao titulo="Quellen und Rechte">
        <p>
          Die Daten gehören ihren jeweiligen Quellen, die in der App angegeben sind: Verkehrsunternehmen (GTFS), IMT, IPMA, Open-Meteo,
          Fogos.pt und ANEPC, OpenStreetMap sowie die Medien (Nachrichten öffnen sich auf der Originalseite). Die Marke und das Design von
          PAROU gehören dem Projekt PAROU.PT.
        </p>
      </Secao>
      <Secao titulo="Anwendbares Recht">
        <p>
          Für diese Bedingungen gilt portugiesisches Recht. Fragen oder Beschwerden:{' '}
          <a className="underline font-semibold" href={`mailto:${CONTACTO}`}>{CONTACTO}</a>.
        </p>
      </Secao>
    </>
  );
}

export function ContactarDe() {
  const linha = 'flex items-center gap-3 min-h-[56px] px-4 py-2 rounded-[14px] border border-[#E6E6E3] bg-[#FFFFFF] active:bg-[#F4F4F2]';
  return (
    <>
      <p className="text-[15.5px] text-[#2B2B2B] leading-relaxed">
        PAROU ist ein Projekt, das eine Person für alle macht. Wenn du eine Frage oder einen Vorschlag hast, einen Fehler gefunden hast,
        eine Partnerschaft anregen möchtest oder als Verkehrsunternehmen Daten teilen willst, sprich mich an – worüber auch immer. Ich
        antworte persönlich, meist innerhalb weniger Tage.
      </p>
      <div className="rounded-[14px] bg-[#F4F4F2] p-4 flex gap-3">
        <MessageCircle className="w-5 h-5 text-[#FF6B1A] shrink-0 mt-0.5" />
        <div className="text-[14px] text-[#111111] leading-snug">
          <div className="font-bold text-[16px]">Dinis Sousa</div>
          <div className="text-[#6B6B6B]">Autor von PAROU.PT</div>
        </div>
      </div>
      <div className="space-y-2">
        <a href={`mailto:${CONTACTO}?subject=PAROU`} className={linha}>
          <Mail className="w-5 h-5 text-[#111111] shrink-0" />
          <span className="flex flex-col leading-tight">
            <span className="text-[12px] text-[#6B6B6B]">E-Mail</span>
            <span className="text-[15px] font-semibold text-[#111111] break-all">{CONTACTO}</span>
          </span>
        </a>
        <a href={`tel:${TELEFONE_LINK}`} className={linha}>
          <Phone className="w-5 h-5 text-[#111111] shrink-0" />
          <span className="flex flex-col leading-tight">
            <span className="text-[12px] text-[#6B6B6B]">Mobil</span>
            <span className="text-[15px] font-semibold text-[#111111]">{TELEFONE}</span>
          </span>
        </a>
      </div>
      <Secao titulo="Worüber du mir schreiben kannst">
        <p>Fehler in Fahrplänen oder Haltestellen, fehlende Linien, Verbesserungsvorschläge, Presse und Partnerschaften, Daten von Verkehrsunternehmen, Anfragen zu deinen Daten (DSGVO) oder einfach ein freundliches Wort.</p>
        <p>Zu Datenschutzfragen oder zum Löschen deines Kontos siehe auch die <a className="underline font-semibold" href="/privacidade">Datenschutzerklärung</a>.</p>
      </Secao>
    </>
  );
}

export function ApagarContaDe() {
  const botao = 'flex items-center gap-3 min-h-[56px] px-4 py-2 rounded-[14px] border border-[#E6E6E3] bg-[#FFFFFF] active:bg-[#F4F4F2]';
  return (
    <>
      <p className="text-[13px] text-[#6B6B6B]">Zuletzt aktualisiert: {ATUALIZADO_DE}</p>
      <p>
        Diese Seite erklärt, wie du dein <strong>PAROU</strong>-Konto (die PAROU-Android-App und die Website parou.pt) und die damit
        verknüpften Daten löschst. Für die Nutzung von PAROU brauchst du kein Konto: Wenn du nie eines erstellt hast, gibt es nichts zu löschen.
      </p>
      <ApagarAqui />
      <Secao titulo="So löschst du dein Konto">
        <p><strong>1. In der App oder auf der Website (sofort).</strong></p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Melde dich in deinem PAROU-Konto an.</li>
          <li>Tippe oben rechts auf deinen Namen, um dein Profil zu öffnen.</li>
          <li>Scrolle ganz nach unten und tippe auf <strong>Konto löschen</strong>.</li>
          <li>Gib dein Passwort ein und bestätige mit <strong>Ja, Konto löschen</strong>.</li>
        </ol>
        <p>Das Konto und die damit verknüpften Daten werden sofort gelöscht.</p>
        <p><strong>2. Per E-Mail</strong>, wenn du die App nicht mehr hast oder dein Passwort vergessen hast.</p>
        <a href={`mailto:${CONTACTO}?subject=PAROU-Konto%20l%C3%B6schen&body=Ich%20m%C3%B6chte%20mein%20PAROU-Konto%20l%C3%B6schen.%20Die%20E-Mail-Adresse%20des%20Kontos%20lautet%3A%20`} className={botao}>
          <Mail className="w-5 h-5 text-[#111111] shrink-0" />
          <span className="flex flex-col leading-tight">
            <span className="text-[12px] text-[#6B6B6B]">Per E-Mail anfragen</span>
            <span className="text-[15px] font-semibold text-[#111111] break-all">{CONTACTO}</span>
          </span>
        </a>
        <p>
          Schreib von der E-Mail-Adresse, mit der du das Konto erstellt hast (oder nenne uns, welche es ist). Wir bestätigen, dass du es
          bist, und löschen das Konto innerhalb von 30 Tagen, meist deutlich schneller.
        </p>
      </Secao>
      <Secao titulo="Was gelöscht wird">
        <ul className="list-disc pl-5 space-y-1">
          <li>Dein Name und deine E-Mail-Adresse.</li>
          <li>Dein Passwort (wir speichern nur eine unumkehrbar verschlüsselte Version, niemals das Passwort selbst).</li>
          <li>Dein Avatar, deine Punkte und Abzeichen.</li>
          <li>Mit dem Konto synchronisierte Favoriten.</li>
          <li>Sitzungen auf allen Geräten und Anfragen zur Passwort-Wiederherstellung.</li>
          <li>Deine Stimmen, Meldungen und die Liste der von dir blockierten Personen.</li>
        </ul>
      </Secao>
      <Secao titulo="Was bleibt">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Vorfälle, Beiträge, Antworten und Kommentare, die du geschrieben hast, bleiben sichtbar, um anderen zu helfen, aber als{' '}
            <strong>„PAROU-Nutzer“</strong>, ohne Verbindung zu deinem Konto. Wenn du möchtest, lösche sie vor dem Löschen des Kontos selbst
            oder bitte uns per E-Mail, sie zu entfernen.
          </li>
          <li>Technische Server-Protokolle (IP-Adresse und Browsertyp, aus Sicherheitsgründen) werden nach 30 Tagen automatisch gelöscht.</li>
          <li>Die anonyme Nutzerzählung ist nicht mit deinem Konto verknüpft.</li>
        </ul>
        <p>Ein gelöschtes Konto kann nicht wiederhergestellt werden. Du kannst jederzeit ein neues erstellen.</p>
      </Secao>
      <Secao titulo="Weitere Informationen">
        <p>
          Lies die <a className="underline font-semibold" href="/privacidade">Datenschutzerklärung</a>, um zu sehen, welche Daten PAROU verwendet und welche Rechte du
          hast, oder <a className="underline font-semibold" href="/contactar">kontaktiere uns</a>.
        </p>
      </Secao>
    </>
  );
}

/** Escolhe a página (carregada só quando o idioma é alemão) */
export default function PaginaDe({ pagina, onAbrir }: { pagina: PaginaInfo; onAbrir: (p: PaginaInfo) => void }) {
  return pagina === 'sobre' ? <SobreDe onAbrir={onAbrir} />
    : pagina === 'privacidade' ? <PrivacidadeDe />
    : pagina === 'contactar' ? <ContactarDe />
    : pagina === 'apagar-conta' ? <ApagarContaDe />
    : <TermosDe />;
}
