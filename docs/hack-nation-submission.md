# Rare Atlas · Hack Nation submission

Hack-Nation's 7th Global AI Hackathon, challenge 05: *AI Atlas for the World's Rare Diseases*.
The full kit (timed scripts for the three 60-second videos, shot lists, architecture diagram, recording checklist) lives in the shared doc:
https://claude.ai/code/artifact/ff83c92a-3f48-4ee5-b81c-343564dd48d3

## What it is

Rare Atlas is a walkable 3D library of the world's rare diseases with a voice AI librarian.

- **Real data.** The Mondo floor lays out all 16,459 rare diseases in the Mondo Disease Ontology (CC BY 4.0) as tiles. Each tile is drawn in a shader from its own record: colour for body system, glyph for disease, syndrome or group, dots for GARD, NORD, Orphanet and OMIM listings, bars for synonyms and cross-references.
- **Synthetic teaching case.** The upper library (GENE-A, Conditions A, B, C) is clearly badged as synthetic. It shows how evidence is presented: what the source reports, what is not established, and its provenance.
- **The librarian** can give the tour itself, reads out the number of records actually loaded, and opens real records with their metadata and provenance. Where data is unavailable it says so instead of showing mock records.

## The one rule: sourced by construction

| Where | What enforces it |
| --- | --- |
| Graph | Every edge carries at least one source and is marked observed or inferred (`shared/schema.js`) |
| Voice agent | OpenAI Realtime over WebRTC, limited to five lookup tools (`shared/tools.js`); short-lived, rate-limited sessions minted by `api/realtime-session.js`; the key never reaches the browser |
| Briefs | `check()` in `api/_lib/brief.js` drops every paragraph that cites nothing or cites an edge it wasn't given |
| Gaps | When nothing supports an answer, the API returns what was searched, what is missing and what to try next (`api/_lib/gap.js`) |
| Database | Firestore is public read, `allow write: if false` (`firestore.rules`) |

## Architecture

Open sources (Mondo, HPO, HPO annotations, Orphadata) → loader (Node: one Mondo ID per disease, information-weighted similarity, hand-checked deep layer) → Firestore graph → Vercel API (search, disease, connections, assets, map, brief, realtime-session) → browser (Three.js world, Evidence Desk, Mondo floor) ↔ OpenAI Realtime.

## Three videos (60 s each)

1. **Team introduction:** who we are, challenge 05, the one rule, what we built.
2. **Product demo:** the librarian gives the tour: Evidence Desk on the synthetic case, print/share a sourced brief, down to the real Mondo floor with the live record count, then the metadata terminal.
3. **Technical walkthrough:** sources → schema → five tools → `check()` → instanced shader floor.

Rare Atlas does not diagnose. Nothing it says replaces a clinician.
