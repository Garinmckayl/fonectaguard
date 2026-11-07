export type Lang = "fi" | "sv" | "nb" | "en";
export const LANGS: Lang[] = ["fi", "sv", "nb", "en"];
export const asLang = (l?: string | null): Lang => (l && (LANGS as string[]).includes(l) ? (l as Lang) : "en");
const LOCALE: Record<Lang, string> = { fi: "fi-FI", sv: "sv-SE", nb: "nb-NO", en: "en-GB" };

type Dict = {
  closed: string; hi: (name: string) => string; subject: (biz: string, n: number) => string;
  intro: (n: number, biz: string) => string; shows: string; suggest: string; because: string;
  approve: string; edit: string; decline: string; approveAll: string; final: string; reviewLink: string;
  editPrompt: string; editBad: (why: string) => string; editConfirm: (plan: string) => string; declined: string; undo: string; undone: string;
  applied: (date: string, plan: string) => string; whereShows: string; savedIn: string; auto: (n: number) => string; adjusted: (from: string) => string;
  units: { min: string; h: string; d: string }; within: string; notConnected: string; alreadyDone: string; failed: string; linked: (biz: string) => string; help: string;
  askQ: string; unsure: string; keep: (shown: string) => string; kept: string; whyMatters: string;
  smsOk: (range: string) => string; smsOr: string; smsNo: string; smsAsNow: string; smsLink: string; smsHelp: string; smsAuto: (n: number) => string; smsUndoHint: string; smsStop: string;
};

export const T: Record<Lang, Dict> = {
  en: {
    closed: "closed", hi: (n) => `Hi ${n}!`, subject: (b, n) => `${b}: ${n === 1 ? "1 opening-hours change" : `${n} opening-hours changes`} to approve`,
    intro: (n, b) => `We checked the days ahead for ${b} and found ${n === 1 ? "a day" : `${n} days`} where Google probably shows the wrong hours.`,
    shows: "Google shows now", suggest: "We suggest", because: "Why", approve: "Approve", edit: "Edit", decline: "No thanks", approveAll: "Approve all", final: "You have the last word: nothing changes until you approve.", reviewLink: "Review and approve (no login)",
    editPrompt: "Send the hours you want for this day, for example “10-15” or “closed”.", editBad: (w) => `I couldn't use that: ${w} Try “10-15” or “closed”.`, editConfirm: (p) => `Got it: ${p}. Saving it now.`, declined: "No problem, we left it as it is and won't suggest this day again.",
    undo: "Undo", undone: "Undone: the previous hours are back.", applied: (d, p) => `Done! ${d}: ${p}`, whereShows: "Where it will show", savedIn: "Saved in Connect and verified.",
    auto: (n) => `As you agreed, we updated ${n === 1 ? "1 day" : `${n} days`} automatically. You can undo any of them.`, adjusted: (f) => `Adjusted to match your change on ${f}.`,
    units: { min: "min", h: "h", d: "days" }, within: "usually within", notConnected: "not connected, not updated", alreadyDone: "This one was already handled.", failed: "Sorry, we couldn't save that to Connect. Nothing was changed.",
    linked: (b) => `You are connected to ${b}. We'll message you here when a day needs attention.`, help: "Open the buttons on a suggestion to approve, edit or decline it.",
    askQ: "Which is right?", unsure: "We're not sure, so we're asking instead of guessing.", keep: (s) => `As Google shows now (${s})`, kept: "Thanks, we left it as Google shows it.", whyMatters: "Why it matters",
    smsOk: (r) => `Reply OK to approve ${r}`, smsOr: "or e.g.", smsNo: "NO", smsAsNow: "as now", smsLink: "Details, no login", smsHelp: 'Sorry, I didn\'t get that. Reply OK to approve, a number and letter like "2B" to pick, "2 10-15" to change, or "NO 2" to skip.', smsAuto: (n) => `As agreed, we updated ${n === 1 ? "1 day" : `${n} days`} for you:`, smsUndoHint: 'Reply "UNDO A1" to undo.', smsStop: "You won't get suggestions by text any more.",
  },
  fi: {
    closed: "suljettu", hi: (n) => `Hei ${n}!`, subject: (b, n) => `${b}: ${n === 1 ? "1 aukioloajan muutos" : `${n} aukioloajan muutosta`} hyväksyttäväksi`,
    intro: (n, b) => `Kävimme läpi yrityksen ${b} tulevat päivät ja löysimme ${n === 1 ? "päivän" : `${n} päivää`}, joilta Google näyttää todennäköisesti väärät aukioloajat.`,
    shows: "Google näyttää nyt", suggest: "Ehdotamme", because: "Perustelu", approve: "Hyväksy", edit: "Muokkaa", decline: "Ei kiitos", approveAll: "Hyväksy kaikki", final: "Sinulla on viimeinen sana: mikään ei muutu ennen kuin hyväksyt.", reviewLink: "Tarkista ja hyväksy (ei kirjautumista)",
    editPrompt: "Kirjoita haluamasi aukioloaika tälle päivälle, esimerkiksi “10-15” tai “suljettu”.", editBad: (w) => `En voinut käyttää tätä: ${w} Kokeile “10-15” tai “suljettu”.`, editConfirm: (p) => `Selvä: ${p}. Tallennetaan.`, declined: "Selvä, jätimme sen ennalleen emmekä ehdota tätä päivää uudelleen.",
    undo: "Kumoa", undone: "Kumottu: aiemmat aukioloajat ovat takaisin.", applied: (d, p) => `Valmis! ${d}: ${p}`, whereShows: "Missä muutos näkyy", savedIn: "Tallennettu Connectiin ja tarkistettu.",
    auto: (n) => `Sovitusti päivitimme ${n === 1 ? "1 päivän" : `${n} päivää`} automaattisesti. Voit kumota minkä tahansa.`, adjusted: (f) => `Muutettu vastaamaan muutostasi päivälle ${f}.`,
    units: { min: "min", h: "h", d: "vrk" }, within: "yleensä", notConnected: "ei yhdistetty, ei päivitetty", alreadyDone: "Tämä on jo hoidettu.", failed: "Valitettavasti emme voineet tallentaa muutosta Connectiin. Mitään ei muutettu.",
    linked: (b) => `Olet yhdistetty yritykseen ${b}. Lähetämme viestin tänne, kun jokin päivä vaatii huomiota.`, help: "Käytä ehdotuksen painikkeita hyväksyäksesi, muokataksesi tai hylätäksesi sen.",
    askQ: "Kumpi pitää paikkansa?", unsure: "Emme ole varmoja, joten kysymme arvaamisen sijaan.", keep: (s) => `Kuten Google nyt näyttää (${s})`, kept: "Kiitos, jätimme sen niin kuin Google sen näyttää.", whyMatters: "Miksi tällä on väliä",
    smsOk: (r) => `Vastaa OK hyväksyäksesi ${r}`, smsOr: "tai esim.", smsNo: "EI", smsAsNow: "ennallaan", smsLink: "Lisätiedot, ei kirjautumista", smsHelp: 'Anteeksi, en ymmärtänyt. Vastaa OK hyväksyäksesi, numero ja kirjain kuten "2B" valitaksesi, "2 10-15" muuttaaksesi tai "EI 2" ohittaaksesi.', smsAuto: (n) => `Sovitusti päivitimme ${n === 1 ? "1 päivän" : `${n} päivää`}:`, smsUndoHint: 'Vastaa "KUMOA A1" kumotaksesi.', smsStop: "Et saa enää ehdotuksia tekstiviestillä.",
  },
  sv: {
    closed: "stängt", hi: (n) => `Hej ${n}!`, subject: (b, n) => `${b}: ${n === 1 ? "1 ändring av öppettider" : `${n} ändringar av öppettider`} att godkänna`,
    intro: (n, b) => `Vi har gått igenom kommande dagar för ${b} och hittat ${n === 1 ? "en dag" : `${n} dagar`} där Google troligen visar fel öppettider.`,
    shows: "Google visar nu", suggest: "Vi föreslår", because: "Varför", approve: "Godkänn", edit: "Ändra", decline: "Nej tack", approveAll: "Godkänn alla", final: "Du har sista ordet: inget ändras förrän du godkänner.", reviewLink: "Granska och godkänn (ingen inloggning)",
    editPrompt: "Skriv de öppettider du vill ha för dagen, till exempel “10-15” eller “stängt”.", editBad: (w) => `Det gick inte att använda: ${w} Prova “10-15” eller “stängt”.`, editConfirm: (p) => `Uppfattat: ${p}. Sparar nu.`, declined: "Inga problem, vi lämnade det som det är och föreslår inte den här dagen igen.",
    undo: "Ångra", undone: "Ångrat: de tidigare öppettiderna är tillbaka.", applied: (d, p) => `Klart! ${d}: ${p}`, whereShows: "Var det syns", savedIn: "Sparat i Connect och verifierat.",
    auto: (n) => `Som överenskommet uppdaterade vi ${n === 1 ? "1 dag" : `${n} dagar`} automatiskt. Du kan ångra vilken som helst.`, adjusted: (f) => `Justerat efter din ändring för ${f}.`,
    units: { min: "min", h: "h", d: "dygn" }, within: "oftast inom", notConnected: "inte ansluten, inte uppdaterad", alreadyDone: "Den här är redan hanterad.", failed: "Tyvärr kunde vi inte spara ändringen i Connect. Inget ändrades.",
    linked: (b) => `Du är ansluten till ${b}. Vi skriver här när en dag behöver din uppmärksamhet.`, help: "Använd knapparna på ett förslag för att godkänna, ändra eller avböja det.",
    askQ: "Vilket stämmer?", unsure: "Vi är inte säkra, så vi frågar i stället för att gissa.", keep: (s) => `Som Google visar nu (${s})`, kept: "Tack, vi lät det vara som Google visar det.", whyMatters: "Varför det spelar roll",
    smsOk: (r) => `Svara OK för att godkänna ${r}`, smsOr: "eller t.ex.", smsNo: "NEJ", smsAsNow: "som nu", smsLink: "Detaljer, ingen inloggning", smsHelp: 'Förlåt, det förstod jag inte. Svara OK för att godkänna, en siffra och bokstav som "2B" för att välja, "2 10-15" för att ändra eller "NEJ 2" för att hoppa över.', smsAuto: (n) => `Som överenskommet uppdaterade vi ${n === 1 ? "1 dag" : `${n} dagar`}:`, smsUndoHint: 'Svara "ÅNGRA A1" för att ångra.', smsStop: "Du får inte längre förslag via sms.",
  },
  nb: {
    closed: "stengt", hi: (n) => `Hei ${n}!`, subject: (b, n) => `${b}: ${n === 1 ? "1 endring i åpningstider" : `${n} endringer i åpningstider`} til godkjenning`,
    intro: (n, b) => `Vi har gått gjennom de kommende dagene for ${b} og funnet ${n === 1 ? "en dag" : `${n} dager`} der Google trolig viser feil åpningstider.`,
    shows: "Google viser nå", suggest: "Vi foreslår", because: "Hvorfor", approve: "Godkjenn", edit: "Endre", decline: "Nei takk", approveAll: "Godkjenn alle", final: "Du har siste ord: ingenting endres før du godkjenner.", reviewLink: "Se over og godkjenn (uten innlogging)",
    editPrompt: "Skriv åpningstiden du vil ha for dagen, for eksempel «10-15» eller «stengt».", editBad: (w) => `Jeg kunne ikke bruke det: ${w} Prøv «10-15» eller «stengt».`, editConfirm: (p) => `Forstått: ${p}. Lagrer nå.`, declined: "Helt greit, vi lot det stå som det er og foreslår ikke denne dagen igjen.",
    undo: "Angre", undone: "Angret: de forrige åpningstidene er tilbake.", applied: (d, p) => `Ferdig! ${d}: ${p}`, whereShows: "Hvor det vises", savedIn: "Lagret i Connect og verifisert.",
    auto: (n) => `Som avtalt oppdaterte vi ${n === 1 ? "1 dag" : `${n} dager`} automatisk. Du kan angre hvilken som helst.`, adjusted: (f) => `Justert etter endringen din for ${f}.`,
    units: { min: "min", h: "t", d: "døgn" }, within: "vanligvis innen", notConnected: "ikke tilkoblet, ikke oppdatert", alreadyDone: "Denne er allerede håndtert.", failed: "Beklager, vi kunne ikke lagre endringen i Connect. Ingenting ble endret.",
    linked: (b) => `Du er koblet til ${b}. Vi skriver her når en dag trenger oppmerksomhet.`, help: "Bruk knappene på et forslag for å godkjenne, endre eller avslå det.",
    askQ: "Hva stemmer?", unsure: "Vi er ikke sikre, så vi spør i stedet for å gjette.", keep: (s) => `Slik Google viser nå (${s})`, kept: "Takk, vi lot det stå slik Google viser det.", whyMatters: "Hvorfor det betyr noe",
    smsOk: (r) => `Svar OK for å godkjenne ${r}`, smsOr: "eller f.eks.", smsNo: "NEI", smsAsNow: "som nå", smsLink: "Detaljer, uten innlogging", smsHelp: 'Beklager, det forsto jeg ikke. Svar OK for å godkjenne, et tall og en bokstav som "2B" for å velge, "2 10-15" for å endre eller "NEI 2" for å hoppe over.', smsAuto: (n) => `Som avtalt oppdaterte vi ${n === 1 ? "1 dag" : `${n} dager`}:`, smsUndoHint: 'Svar "ANGRE A1" for å angre.', smsStop: "Du får ikke lenger forslag på sms.",
  },
};

export const fmtDate = (iso: string, l: Lang) => new Intl.DateTimeFormat(LOCALE[l], { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
export const fmtDateShort = (iso: string, l: Lang) => new Intl.DateTimeFormat(LOCALE[l], { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

/** "closed" | "10:00-14:00,17:00-22:00" -> "10:00–14:00 & 17:00–22:00" in the reader's language. */
export function fmtHours(h: string | null | undefined, l: Lang): string {
  if (!h || h === "closed") return T[l].closed;
  return h.split(",").map((x) => x.replace("-", "–")).join(" & ");
}

/** Seconds -> "2 min", "1 h", "3 days" in the reader's language. */
export function fmtEta(seconds: number, l: Lang): string {
  const u = T[l].units;
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} ${u.min}`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} ${u.h}`;
  const d = Math.round(seconds / 86400);
  return `${d} ${l === "en" ? (d === 1 ? "day" : "days") : u.d}`;
}
