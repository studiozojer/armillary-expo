import { render, screen } from '@testing-library/react-native';

import { VoicenotePage, isAudioPath } from '../src/components/voicenote-page';

describe('isAudioPath', () => {
  it('recognises the extensions the inbox actually receives', () => {
    expect(isAudioPath('local/inbox/memo.m4a')).toBe(true);
    expect(isAudioPath('local/inbox/MEMO.M4A')).toBe(true);
    expect(isAudioPath('zojercommons/BOARD.md')).toBe(false);
  });
});

describe('VoicenotePage', () => {
  it('links to the transcript when one exists', async () => {
    await render(
      <VoicenotePage
        path="local/inbox/done.m4a"
        entry={{
          audio: 'local/inbox/done.m4a',
          bytes: 3612044,
          state: 'transcribed',
          transcript: {
            path: 'zojercommons/voicenotes/2026-07-22-done.md',
            title: 'Expo harness pt.1 — raw transcript',
            transcribed_by: '@tycho',
          },
        }}
      />,
    );
    expect(screen.getByText('Expo harness pt.1 — raw transcript')).toBeTruthy();
  });

  it('shows the transcribe command when it has not been transcribed', async () => {
    await render(
      <VoicenotePage
        path="local/inbox/pending.m4a"
        entry={{ audio: 'local/inbox/pending.m4a', bytes: 100, state: 'untranscribed' }}
      />,
    );
    expect(screen.getByText(/transcribe\.py/)).toBeTruthy();
  });

  it('says the audio is on another machine rather than implying it is missing', async () => {
    // The common case on a second host: transcripts are committed, the .m4a
    // never left the machine that recorded it. "Not found" would be wrong.
    await render(
      <VoicenotePage
        path="local/inbox/elsewhere.m4a"
        entry={{
          audio: 'local/inbox/elsewhere.m4a',
          state: 'audio_absent',
          transcript: { path: 'zojercommons/voicenotes/2026-07-23-elsewhere.md' },
        }}
      />,
    );
    expect(screen.getByText(/not on this machine/i)).toBeTruthy();
  });

  it('renders the player as visibly unbuilt rather than broken', async () => {
    await render(
      <VoicenotePage
        path="local/inbox/pending.m4a"
        entry={{ audio: 'local/inbox/pending.m4a', bytes: 100, state: 'untranscribed' }}
      />,
    );
    expect(screen.getByText(/playback not built yet/i)).toBeTruthy();
  });
});
