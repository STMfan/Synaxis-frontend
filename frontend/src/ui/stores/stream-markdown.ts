/** Close only unfinished Markdown syntax for the provisional display. Source stays untouched. */
export function streamingMarkdown(source: string): string {
  let text = source.replace(/^\s*```(?:markdown|md)\s*\n/i, '').replace(/\n```\s*$/, '');
  const fences = text.match(/^\s*(`{3,}|~{3,})[^\n]*$/gm) || [];
  if (fences.length % 2) return text + '\n' + fences.at(-1)!.trim().match(/^(`{3,}|~{3,})/)![0];
  // Keep unfinished TeX readable without sending it into MathJax.
  text = text.split(/(\\\[[^]*?\\\]|\\\([^]*?\\\)|\$\$[^]*?\$\$)/g).map((part, i) => i % 2 ? part : part.replace(/(?:\\\[|\\\(|\$\$)([^]*)$/, (_, tail) => '`' + tail.replaceAll('`', '') + '`')).join('');
  text = text.replace(/(?<!\\)\$(?=[\\A-Za-z])([^\n$]*)$/, (_, tail) => '`' + tail.replaceAll('`', '') + '`');
  text = text.replace(/!?\[([^\]\n]*)\]\([^\)\n]*$/, '$1').replace(/!?\[([^\]\n]*)$/, '$1');
  const code = text.match(/(?<!\\)`+/g) || [];
  if (code.length % 2) text += code.at(-1);
  // Protect literal code, escapes and complete TeX while balancing emphasis.
  const probe = text.replace(/`[^`]*`|\\[\s\S]|\$\$[^]*?\$\$/g, '');
  for (const marker of ['**', '__', '~~']) {
    let count = 0, at = 0;
    while ((at = probe.indexOf(marker, at)) !== -1) { count++; at += marker.length; }
    if (count % 2) text += marker;
  }
  return text.replace(/(^|\n)\s{0,3}#{1,6}\s*$/, '$1');
}
