import type { ReactNode } from "react";
import { LOSS_SCORE_EXPLANATION, SCORE_EXPLANATION, TIME_TIE_BREAK_EXPLANATION } from "./messages";
import { Modal } from "./Modal";
import "./RulesDialog.css";

const REPOSITORY_URL = "https://github.com/grehnen/akle";

type RulesDialogProps = {
  onClose: () => void;
};

/** How to play, in Swedish; mirrors the README's "How to play" and "What counts as a neighbor?". */
export function RulesDialog({ onClose }: RulesDialogProps) {
  return (
    <Modal label="Så spelar du" className="rules-dialog" onClose={onClose}>
      <h2 className="rules-heading">Så spelar du</h2>
      <p className="rules-intro">
        Ange kommuner för att resa från <strong className="rules-start">startkommunen</strong> till{" "}
        <strong className="rules-destination">målkommunen</strong>. Försök komma fram på så få
        gissningar som möjligt!
      </p>
      <div className="rules-sections">
        <RulesSection title="Gissningar">
          <p>
            Varje dag får alla samma start- och målkommun. Ange kommunerna som förbinder dem, granne
            efter granne, och ta dig från start till mål på så få gissningar som möjligt.
          </p>
          <p>Varje gissning visas på kartan och får en markering:</p>
          <ul className="rules-marks">
            <li>✅ på en kortaste rutt och ansluten till starten</li>
            <li>🟩 på en kortaste rutt, men ännu inte ansluten till starten</li>
            <li>🟧 nära en kortaste rutt</li>
            <li>🟥 långt från en kortaste rutt</li>
          </ul>
        </RulesSection>
        <RulesSection title="Resultat">
          <p>
            Hur många gissningar du får beror på hur lång den kortaste rutten är. Använder du fler
            gissningar än den kortaste rutten kräver visar resultatet skillnaden, till exempel{" "}
            <strong>+2</strong>. Kommer du fram med bara ✅ och utan ledtrådar blir det{" "}
            <strong>Perfekt</strong>.
          </p>
          <p>
            Vinn flera dagar i rad för att bygga en svit, och dela ett resultat utan spoilers med
            dina vänner. En ny resa börjar vid midnatt, din lokala tid.
          </p>
        </RulesSection>
        <RulesSection title="Ledtrådar">
          <p>
            Kört fast? Det finns tre ledtrådar: konturen av nästa kommun på en kortaste rutt,
            konturerna av alla kommuner och sedan deras initialer. Ledtrådar kostar inga gissningar,
            men ett spel med ledtrådar kan inte bli Perfekt.
          </p>
        </RulesSection>
        <RulesSection title="Poäng i fri resa">
          <p>{SCORE_EXPLANATION}</p>
          <p>{LOSS_SCORE_EXPLANATION}</p>
          <p>{TIME_TIE_BREAK_EXPLANATION}</p>
        </RulesSection>
        <RulesSection title="Vad räknas som grannar?">
          <p>Två kommuner är grannar när du kan ta dig från den ena till den andra:</p>
          <ul>
            <li>
              <strong>över land</strong>, via en gemensam gräns, även om de bara möts i en enda
              punkt;
            </li>
            <li>
              <strong>över en bro eller genom en tunnel</strong>, via en allmän väg, gångväg eller
              järnväg.
            </li>
          </ul>
          <p>
            Gränser längs ett vattendrag räknas också, så länge de är minst en kilometer långa. Små
            holmar, korta gränser längs vattendrag och avskilda delar av en kommun (exklaver) räknas
            inte.
          </p>
          <p>
            Gotland och Öckerö har varken bro eller landgräns, så de är förbundna med färja. De är
            återvändsgränder: en rutt kan börja eller sluta där, men aldrig passera igenom.
          </p>
          <p>
            Varje gränsfall har kontrollerats för hand. Tycker du att två kommuner borde (eller inte
            borde) vara grannar? Använd länken <em>Rapportera fel</em> i spelet.
          </p>
        </RulesSection>
      </div>
      <p className="rules-source">
        <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
          Åkle på GitHub
        </a>
      </p>
    </Modal>
  );
}

function RulesSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="rules-section">
      <summary>{title}</summary>
      <div className="rules-section-body">{children}</div>
    </details>
  );
}

export function RulesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
        <circle cx="12" cy="12" r="9.5" />
        <path d="M9.25 9.25a2.75 2.75 0 1 1 3.9 2.5c-.7.33-1.15 1-1.15 1.75v.5" />
      </g>
      <circle cx="12" cy="17.25" r="1.35" fill="currentColor" />
    </svg>
  );
}
