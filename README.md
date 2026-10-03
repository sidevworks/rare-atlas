# Rare Atlas

A voice-led atlas of the world's rare diseases. A family or a patient-group
leader walks up to a desk, asks a question in their own language, and the atlas
answers by travelling the graph in front of them: from their disease, along
links that each cite a source, to a related disease, a group already working on
it, and a next step.

Built for Hack-Nation's 7th Global AI Hackathon, challenge 05: *AI Atlas for
the World's Rare Diseases* (OpenAI and the Buffalo Initiative).

**Status: in progress.** This file describes the design. Each section is
marked once the part it describes is working.

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

## Two layers of evidence

- **Wide.** Every disease the open files cover: names, synonyms, genes and
  symptoms, loaded in bulk.
- **Deep.** One cluster, checked by hand: mechanism, patient groups,
  registries and studies.

Outside the deep cluster the atlas answers from the wide layer and says plainly
that no verified patient-group link exists yet.

## Running it

To be written as each part lands: installing, the environment file, running
the loader to reproduce the dataset, and starting the atlas locally.

## Not medical advice

The atlas connects published research and public records. It does not diagnose,
and nothing it says replaces a clinician.
