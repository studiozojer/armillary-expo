import { createSSEParser, SSEFrame } from '../src/lib/session/sse';

describe('SSE Parser', () => {
  it('parses one complete frame', () => {
    const parser = createSSEParser();
    const frames = parser.feed('event: test\ndata: hello\n\n');
    expect(frames).toEqual([{ event: 'test', data: 'hello' }]);
  });

  it('parses a frame split mid-line across two feed calls', () => {
    const parser = createSSEParser();
    const chunk1 = parser.feed('event: te');
    expect(chunk1).toEqual([]);
    const chunk2 = parser.feed('st\ndata: hello\n\n');
    expect(chunk2).toEqual([{ event: 'test', data: 'hello' }]);
  });

  it('yields two frames in order from a single chunk', () => {
    const parser = createSSEParser();
    const frames = parser.feed('event: first\ndata: a\n\nevent: second\ndata: b\n\n');
    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual({ event: 'first', data: 'a' });
    expect(frames[1]).toEqual({ event: 'second', data: 'b' });
  });

  it('joins multi-line data with newlines', () => {
    const parser = createSSEParser();
    const frames = parser.feed('event: test\ndata: line1\ndata: line2\ndata: line3\n\n');
    expect(frames).toEqual([{ event: 'test', data: 'line1\nline2\nline3' }]);
  });

  it('ignores comment lines', () => {
    const parser = createSSEParser();
    const frames = parser.feed('event: test\n: this is a comment\ndata: hello\n\n');
    expect(frames).toEqual([{ event: 'test', data: 'hello' }]);
  });

  it('ignores unknown fields', () => {
    const parser = createSSEParser();
    const frames = parser.feed('event: test\nid: 123\nretry: 5000\ndata: hello\n\n');
    expect(frames).toEqual([{ event: 'test', data: 'hello' }]);
  });

  it('parses CRLF input identically to LF', () => {
    const parser1 = createSSEParser();
    const frames1 = parser1.feed('event: test\r\ndata: hello\r\n\r\n');

    const parser2 = createSSEParser();
    const frames2 = parser2.feed('event: test\ndata: hello\n\n');

    expect(frames1).toEqual(frames2);
  });

  it('emits nothing for a frame with event but no data', () => {
    const parser = createSSEParser();
    const frames = parser.feed('event: test\n\n');
    expect(frames).toEqual([]);
  });

  it('keeps trailing incomplete frame buffered until completed', () => {
    const parser = createSSEParser();
    const chunk1 = parser.feed('event: complete\ndata: one\n\nevent: incom');
    expect(chunk1).toHaveLength(1);
    expect(chunk1[0]).toEqual({ event: 'complete', data: 'one' });

    const chunk2 = parser.feed('plete\ndata: two\n\n');
    expect(chunk2).toEqual([{ event: 'incomplete', data: 'two' }]);
  });

  it('strips optional leading space after colon', () => {
    const parser1 = createSSEParser();
    const frames1 = parser1.feed('data: hello\n\n');

    const parser2 = createSSEParser();
    const frames2 = parser2.feed('data:hello\n\n');

    const parser3 = createSSEParser();
    const frames3 = parser3.feed('data:  hello\n\n');

    expect(frames1).toEqual([{ event: 'message', data: 'hello' }]);
    expect(frames2).toEqual([{ event: 'message', data: 'hello' }]);
    expect(frames3).toEqual([{ event: 'message', data: ' hello' }]);
  });

  it('defaults event to message when absent', () => {
    const parser = createSSEParser();
    const frames = parser.feed('data: hello\n\n');
    expect(frames).toEqual([{ event: 'message', data: 'hello' }]);
  });

  it('handles comment and unknown fields mixed with real fields', () => {
    const parser = createSSEParser();
    const frames = parser.feed('event: test\n: comment\nid: 1\ndata: a\nretry: 1000\ndata: b\n\n');
    expect(frames).toEqual([{ event: 'test', data: 'a\nb' }]);
  });

  it('parses multiple frames with mixed content', () => {
    const parser = createSSEParser();
    const frames = parser.feed(
      'event: envelope\ndata: {"id": 1}\n\n' +
      ': keep-alive\n\n' +
      'event: gap\ndata: missed\n\n'
    );
    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual({ event: 'envelope', data: '{"id": 1}' });
    expect(frames[1]).toEqual({ event: 'gap', data: 'missed' });
  });

  it('handles frame split across many chunks', () => {
    const parser = createSSEParser();
    let result = parser.feed('event:');
    expect(result).toEqual([]);

    result = parser.feed(' myevent');
    expect(result).toEqual([]);

    result = parser.feed('\ndata: pay');
    expect(result).toEqual([]);

    result = parser.feed('load\n\n');
    expect(result).toEqual([{ event: 'myevent', data: 'payload' }]);
  });
});
