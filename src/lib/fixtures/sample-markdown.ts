// Exercises every construct the commons actually uses, including a wikilink —
// which must degrade to visible plain text rather than crash. Wikilink
// navigation is deliberately out of scope for sprint 1, but the corpus is full
// of them, so "does not explode" is a real requirement.

export const SAMPLE_MARKDOWN = `# harness anatomy

The deflationary answer to "how big a technical feat is a harness."

## The irreducible core

A harness is **~5% loop, ~95% plumbing**, and the intelligence is in *neither*.

- Assemble the request
- Send it
- Execute the tool the model asked for

| engine | language | note |
|---|---|---|
| pi | TypeScript | the clean loop |
| opencode | TypeScript | a small distributed system |

\`\`\`rust
fn resolve(root: &Path, user: &str) -> Result<PathBuf, GuardError> {
    todo!()
}
\`\`\`

See [[athanor/grounding/the-flat-window]] for the diagnosis.

> A citation that cannot be followed reads exactly like one that can.
`;
