/** Tiny, safe markdown subset for AI briefs: ## headings, - bullets, paragraphs. No HTML is ever injected. */
export function MiniMarkdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: number) => {
    if (list.length) {
      blocks.push(<ul key={`l${k}`} className="my-2 list-disc space-y-1 pl-5">{list.map((x, i) => <li key={i}>{x}</li>)}</ul>);
      list = [];
    }
  };
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (/^[-*]\s+/.test(line)) { list.push(line.replace(/^[-*]\s+/, "")); return; }
    flush(i);
    if (/^#{1,3}\s+/.test(line)) blocks.push(<h3 key={i} className="mt-4 text-sm font-semibold">{line.replace(/^#{1,3}\s+/, "")}</h3>);
    else if (line) blocks.push(<p key={i} className="my-1 text-sm">{line.replace(/^_|_$/g, "")}</p>);
  });
  flush(9999);
  return <div>{blocks}</div>;
}
