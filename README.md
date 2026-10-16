# PAD Flow Cleaner

Turn a messy **Power Automate Desktop** flow into a clear picture.

**Use it now: https://mingssii2.github.io/pad-flow-cleaner/**

Paste a PAD flow and get back:

- **A compact, secret-free version.** Default parameters and selector noise are removed, and passwords, tokens, emails and other PII are masked. It's small enough to review, or to give to an AI assistant.
- **A flowchart** (Mermaid) with IF branches, loops and GOTOs drawn as edges.
- **Step-by-step summary** and a **sequence diagram** of which system the bot talks to.

Everything runs in your browser. Nothing is uploaded, stored or tracked.

## Use it

1. In Power Automate Desktop, open a flow, select all actions (`Ctrl+A`) and copy (`Ctrl+C`).
2. Paste into the page, or drop a `.txt` file onto it.
3. Click **Clean flow**. The flowchart appears first. Switch tabs for Steps, Sequence or the cleaned text. Download as `.txt`, `.svg` or `.mmd`.

New to it? Click **Try a sample**. The sample flow is synthetic: every name, URL and secret in it is fake.

### Merging subflows

PAD copies one subflow at a time. Open **Advanced: merge a main flow with its subflows**, paste `Main`, click **Scan CALLs**, paste each subflow into its box, then click **Merge & clean**. Each subflow is drawn as its own group in the flowchart, with `call` edges between groups.

## Privacy

- The page is one static `index.html`. The only external request is the [Mermaid](https://mermaid.js.org/) library, pinned to an exact version and checked with a Subresource Integrity hash.
- A Content-Security-Policy sets `connect-src 'none'`, so the page can't send your flow anywhere even if a dependency tried.
- No cookies, no localStorage, no IndexedDB, no analytics.

## Limitations

Redaction is pattern-based and best effort. It catches common cases (PAD encrypted text, `SET …Password TO`, JWTs, API keys, connection strings, URL credentials, emails, Thai national IDs and phone numbers with a label), but it can't promise to find every secret. **Review the output before you share it.**

The parser targets the text PAD puts on the clipboard. Unusual or very old flow formats may produce rough diagrams.

## Development

No build step. Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
```

Run the unit tests (Node 18+):

```bash
node tests/test_pad_cleaner.js
```

The tests load the last inline `<script>` in `index.html`, so keep the app code there.

## License

[MIT](LICENSE)
