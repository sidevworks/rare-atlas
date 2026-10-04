# Rare Atlas

A voice-led atlas of the world's rare diseases. A family or a patient-group
leader walks up to a desk, asks a question in their own language, and the atlas
answers by travelling the graph in front of them: from their disease, along
links that each cite a source, to a related disease, a group already working on
it, and a next step.

Built for Hack-Nation's 7th Global AI Hackathon, challenge 05: *AI Atlas for
the World's Rare Diseases* (OpenAI and the Buffalo Initiative).

**Live:** https://rare-atlas-si-devworks.vercel.app/world/index.html

The graph holds 10,397 rare diseases and 324,787 sourced links (238,581 symptom
links, 12,393 gene links, 73,813 similar-disease leads) in 27 clusters, plus a
hand-checked layer for the developmental-epilepsy cluster: 12 patient
organisations, 85 assets, 51 studies and 42 shared-work connections.

## The one rule

The agent never states a medical fact from its own memory. Everything it says
comes from a lookup against the graph, and every link in the graph records
where it came from, when, and whether it was observed in a source or inferred
by the atlas. When the graph holds no supported link, the agent says so, says
what was searched, and says what evidence would change the answer.

## How it fits together

| Part | Where | What it does |
|---|---|---|
| Loader | `loader/` | Reads open disease, gene and symptom files, reconciles names to one id per disease, and writes the graph to the database |
| Graph | Firestore | One record per disease with its genes, symptoms, nearest neighbours and sources. Public to read, written only by the loader |
| Server | `api/` | Looks things up in the graph, checks that every claim has a source, and mints short-lived voice sessions |
| Atlas | `src/` | The world, the desk, the voice agent and a typed search box |
| Apps | `mobile/` | The same atlas wrapped for iOS and Android |
| Mondo floor | `loader/mondo/`, `src/world/`, `liveloop/` | A lower level of the world where every rare disease in the Mondo ontology is a tile drawn from its own record. Built and tested. |

## Two layers of evidence

- **Wide.** Every disease the open files cover: names, synonyms, genes and
  symptoms, loaded in bulk.
- **Deep.** One cluster, checked by hand: mechanism, patient groups,
  registries and studies.

Outside the deep cluster the atlas answers from the wide layer and says plainly
that no verified patient-group link exists yet.

## The Mondo floor

The world has a second level. A stairwell beside the library leads down to a
floor laid out as a mosaic: one tile for each of the 16,459 diseases in the
rare subset of the [Mondo Disease Ontology](https://mondo.monarchinitiative.org/),
sorted into galleries by Mondo's body-system categories and alphabetical along
each ring. Every tile is an image drawn by a shader from that disease's own
record, so the metadata is visible before any name is read:

- colour: the gallery (nervous system, blood, skin, and so on);
- glyph: a circle for a disease, a hexagon for a syndromic disease, a square
  for a disease group, sized by how many subtypes sit beneath it;
- dots: whether GARD, NORD, Orphanet and OMIM list it;
- bars: synonyms on the left, cross-references on the right;
- a line under the glyph when the record carries a definition.

Walking close turns the nearest tiles into cards with the name and id. The
panel searches names, walks to a gallery, filters by source and opens the
Mondo record. `O` shows the whole floor from above; `Esc` returns upstairs.

Rebuild the data from the latest Mondo release (downloads about 100 MB):

    npm run load:mondo                     # from the Mondo release
    npm run load:mondo -- --dir ./my-files # from a folder of per-disease JSON files

It writes `data/build/mondo-floor.json` (full records) and
`data/build/mondo-floor.compact.json` (typed arrays for the world). The compact
file is committed at `public/mondo/` so the world can fetch it from this
repository. The LiveLoop state is produced by `npm run liveloop:build` and
saved as the next state of the world; it also carries a small sample so the
floor still renders when nothing can be fetched.

Mondo is CC BY 4.0. The floor shows ontology terms, not patient data, and is
not medical advice.

## Running it

    npm install
    cp .env.example .env.local     # add OPENAI_API_KEY and FIREBASE_PROJECT_ID
    npm run dev                    # the atlas and its server on one port

With no `FIREBASE_PROJECT_ID` and no local build, the server answers from a
small sample that is labelled as sample data.

## Reproducing the dataset

    npm run load                   # downloads Mondo, HPO and Orphanet open files
                                   # (about 120 MB) and builds data/build/
    npm run load:check             # every link has a source; no dangling ids
    node loader/deep/run.js        # adds the hand-checked layer from
                                   # loader/deep/curated/groups.json
    npm run load:upload            # writes the build to Firestore

The upload needs `gcloud auth application-default login` and
`FIREBASE_PROJECT_ID`. The build is deterministic: the same source files give
the same graph.

## How OpenAI is used

- **Voice.** OpenAI Realtime over WebRTC (`gpt-realtime-2.1`). The server mints
  a short-lived secret; the browser connects directly. The agent has five
  lookups (`shared/tools.js`) and no other source of fact.
- **The brief.** The server asks an OpenAI model for a proposal built only from
  supplied links, then removes any paragraph that cites a link not in the graph.

## Known limits

- Mechanism (gain or loss of function per gene) is not in the graph yet.
- Dravet syndrome (SCN1A) is missing from the hand-checked layer.
- The world page is built in LiveLoop and stripped to a standalone page by
  `liveloop/make-standalone.js`.

## Not medical advice

The atlas connects published research and public records. It does not diagnose,
and nothing it says replaces a clinician.
