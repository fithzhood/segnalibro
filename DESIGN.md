# DESIGN.md — Segnalibro

## Soggetto e persone
Una persona sola, sul tablet (800×1280 css, anche in orizzontale), la sera sul divano.
Apre l'app per riprendere una serie dal punto giusto: deve vedere subito che cosa
ha da vedere e arrivarci con un tocco.

## Colori
- Notte #15171c — fondo
- Lavagna #22252c — superficie di card e dialoghi
- Carta #ece7dd — testo principale
- Cenere #8d929b — testo secondario, tacche degli episodi visti
- Lanterna #f0a640 — episodi usciti e non ancora visti, azione primaria
- Brace #d2553f — azioni distruttive (elimina, droppa)
Il giallo-arancio della lanterna significa sempre "c'è qualcosa da vedere".

## Tipografia
- Titoli e testo: "Zen Kaku Gothic New" (gotico giapponese, si addice al soggetto),
  ripiego system-ui.
- Numeri degli episodi: stessa famiglia, `font-variant-numeric: tabular-nums`.

## Un dettaglio caratterizzante
Le tacche: sotto ogni copertina una fila di trattini, uno per episodio. Grigi i visti,
lanterna gli usciti da vedere, appena accennati quelli non ancora usciti. Oltre 30
episodi diventano una barra a tre tratti con lo stesso codice.

## Glossario
- "episodio" (anime, serie), "capitolo" (manga). Sigle: "Ep.", "Cap."
- "In corso", "Archivio"; nell'archivio: "Finiti", "Droppati"
- "Visto" = segna come visto il prossimo episodio
- "link che segue l'episodio" / "link fisso"

## Tono per momento
Errore: causa e rimedio ("AniList non risponde. I dati salvati restano, riprova più tardi").
Distruttivo: conseguenza esplicita ("Elimina dal catalogo. Non si può annullare").
Successo: toast con stato concreto e Annulla. Nessun "!".
Vuoto: cosa apparirà e il bottone per riempirlo.

## Stati
Vuoto (in corso, archivio), ricerca AniList (in corso, nessun risultato, errore),
link senza numero, salvataggio non riuscito (memoria piena).

## Default
Ordinamento e filtro: l'ultimo scelto. Tipo del nuovo titolo: quello del filtro attivo,
o dedotto dal link. Episodi visti: dedotti dal link incollato.
