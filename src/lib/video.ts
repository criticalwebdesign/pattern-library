export type VideoEmbed = { kind: 'youtube' | 'vimeo'; embedUrl: string } | { kind: 'file'; url: string };

export function resolveVideoEmbed(url: string): VideoEmbed {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').replace(/^m\./, '');

    if (host === 'youtube.com') {
      const id = parsed.searchParams.get('v') ?? parsed.pathname.match(/^\/shorts\/([^/]+)/)?.[1];
      if (id) return { kind: 'youtube', embedUrl: `https://www.youtube.com/embed/${id}` };
    }
    if (host === 'youtu.be') {
      const id = parsed.pathname.slice(1);
      if (id) return { kind: 'youtube', embedUrl: `https://www.youtube.com/embed/${id}` };
    }
    if (host === 'vimeo.com') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      if (id) return { kind: 'vimeo', embedUrl: `https://player.vimeo.com/video/${id}` };
    }
  } catch {
    // not a parseable URL — fall through and treat as a direct file link
  }
  return { kind: 'file', url };
}
