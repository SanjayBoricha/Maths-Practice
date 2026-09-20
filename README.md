# SSC Maths Practice Website

Static site for practising classroom-sheet JSON chapters in 25-question sets.

## Add another chapter
1. Put the JSON file in `data/`.
2. Add an entry to `data/manifest.json`: `{ "id": "chapter-id", "name": "Chapter Name", "file": "YourFile.json" }`.
3. Serve the folder with any static web server.

You can also use **Import JSON** to load one or more compatible JSON files for the current browser session without editing the manifest.

## JSON format
Use schema version 2:
```json
{
  "schema_version": 2,
  "chapter_id": "ratio",
  "chapter_name": "Ratio",
  "source_file": "Ratio (ClassRoom Sheet).pdf",
  "questions": [
    {
      "id": 1,
      "section": "Type 1 — Basic Questions",
      "question_markdown": "If $a:b=5:7$, ...",
      "options": {"A":"...","B":"...","C":"...","D":"..."},
      "answer": {"option":"B","text":"..."},
      "pdf_page": 2
    }
  ]
}
```

The website tracks answered question IDs per chapter in localStorage so **Continue from progress** avoids already answered questions.


## Added chapters (v12)
Proportion, Questions Based on Age, Partnership, Mixture, Alligation, Simple Interest, and SI Installment were extracted from the supplied classroom-sheet PDFs with source answer keys and source section/type headings where present.
