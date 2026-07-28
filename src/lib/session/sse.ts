export type SSEFrame = { event: string; data: string };

export function createSSEParser(): { feed(chunk: string): SSEFrame[] } {
  let buffer = '';

  return {
    feed(chunk: string): SSEFrame[] {
      // Strip CR from CRLF, convert to LF only
      buffer += chunk.replace(/\r/g, '');

      const frames: SSEFrame[] = [];

      // Split on double newlines (blank lines)
      const parts = buffer.split('\n\n');

      // The last part might be incomplete, so keep it in the buffer
      buffer = parts[parts.length - 1];

      // Process all complete frames (everything except the last part)
      for (let i = 0; i < parts.length - 1; i++) {
        const frameText = parts[i];
        const frame = parseFrame(frameText);
        if (frame) {
          frames.push(frame);
        }
      }

      return frames;
    },
  };
}

function parseFrame(frameText: string): SSEFrame | null {
  const lines = frameText.split('\n');
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line) {
      // Empty line, skip
      continue;
    }

    if (line.startsWith(':')) {
      // Comment, ignore
      continue;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      // No colon, ignore this line
      continue;
    }

    const field = line.substring(0, colonIndex);
    let value = line.substring(colonIndex + 1);

    // Strip optional leading space after colon
    if (value.startsWith(' ')) {
      value = value.substring(1);
    }

    if (field === 'event') {
      event = value;
    } else if (field === 'data') {
      dataLines.push(value);
    }
    // Ignore other fields (id, retry, unknown fields)
  }

  // Only emit if there's data
  if (dataLines.length === 0) {
    return null;
  }

  return {
    event,
    data: dataLines.join('\n'),
  };
}
