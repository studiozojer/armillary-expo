import { annotationsFor } from '../src/lib/annotations';

const composition = {
  operators: [{ name: 'tycho', path: 'operators/tycho', note: 'journaling / graph' }],
  commons: [{ name: 'zojercommons', path: 'zojercommons' }],
  repos: [{ name: 'iching', path: 'repos/iching', note: 'iOS I Ching app' }],
  protocols: [],
  manifests: [],
  protocol_sources: [],
};

describe('annotationsFor', () => {
  it('annotates a module composed at the workspace root', () => {
    expect(annotationsFor(composition)['zojercommons']).toBe('commons');
  });

  it('annotates a slot directory by how many modules it holds', () => {
    // `operators/` and `repos/` are directories on disk, not modules. What the
    // manifest knows about them is a count, and that is worth saying.
    expect(annotationsFor(composition)['operators']).toBe('1 composed');
    expect(annotationsFor(composition)['repos']).toBe('1 composed');
  });

  it('leaves an undeclared entry with no annotation', () => {
    // The silence is the information: `local/` is on disk and composed by
    // nothing, and saying nothing about it says exactly that.
    expect(annotationsFor(composition)['local']).toBeUndefined();
  });

  it('does not label an unnoted root-level operator or repo "commons"', () => {
    // A root-level `[[repos]]` (or `[[operators]]`) entry with no `note` is
    // not the commons — the manifest just didn't say anything about it. The
    // old fallback invented "commons" for this case because it was shared
    // code with the commons caller's own default; each caller must supply its
    // own default, not inherit one meant for someone else.
    const withRootRepo = {
      ...composition,
      repos: [
        ...composition.repos,
        { name: 'armillary-core', path: 'armillary-core' },
      ],
    };
    expect(annotationsFor(withRootRepo)['armillary-core']).toBeUndefined();
  });
});
