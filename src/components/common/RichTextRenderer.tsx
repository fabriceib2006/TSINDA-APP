import React from 'react';

interface RichTextRendererProps {
  content?: string;
  className?: string;
}

export const RichTextRenderer: React.FC<RichTextRendererProps> = ({ content = '', className = '' }) => {
  if (!content) return null;

  // Split lines
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  // Helper to format inline bold, italic, code
  const renderInline = (text: string): React.ReactNode => {
    // Replace **bold**
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={idx} className="italic text-slate-800">{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={idx} className="px-1.5 py-0.5 bg-slate-100 text-blue-700 font-mono text-xs rounded">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // 1. Table Detection (Line contains | and next line has | --- |)
    if (line.startsWith('|') && line.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const headerRow = tableLines[0]
          .split('|')
          .slice(1, -1)
          .map((col) => col.trim());
        
        // Second row is delimiter like | --- | --- |
        const bodyRows = tableLines.slice(2).map((row) =>
          row
            .split('|')
            .slice(1, -1)
            .map((col) => col.trim())
        );

        elements.push(
          <div key={`table-${i}`} className="my-4 overflow-x-auto rounded-lg border border-slate-200 shadow-2xs">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                <tr>
                  {headerRow.map((col, idx) => (
                    <th key={idx} className="py-2.5 px-4 font-semibold uppercase tracking-wider text-[11px] sm:text-xs">
                      {renderInline(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {bodyRows.map((cols, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/60 transition-colors">
                    {cols.map((col, cIdx) => (
                      <td key={cIdx} className="py-2 px-4 text-xs sm:text-sm">
                        {renderInline(col)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // 2. Headings
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-base sm:text-lg font-bold text-slate-900 mt-4 mb-2">
          {renderInline(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-lg sm:text-xl font-bold text-slate-900 mt-5 mb-2 pb-1 border-b border-slate-100">
          {renderInline(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-6 mb-3">
          {renderInline(line.slice(2))}
        </h1>
      );
      i++;
      continue;
    }

    // 3. Blockquotes / Gazette Notes
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote
          key={i}
          className="my-3 pl-4 border-l-4 border-blue-500 bg-blue-50/50 py-2 pr-3 rounded-r-md text-xs sm:text-sm text-blue-900 italic"
        >
          {renderInline(line.slice(2))}
        </blockquote>
      );
      i++;
      continue;
    }

    // 4. Bullet lists
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const listItems: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))) {
        listItems.push(lines[i].trim().slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="my-2.5 space-y-1.5 pl-5 list-disc text-slate-800 text-xs sm:text-sm marker:text-blue-500">
          {listItems.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // 5. Numbered lists
    if (/^\d+\.\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s*/, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-2.5 space-y-1.5 pl-5 list-decimal text-slate-800 text-xs sm:text-sm marker:text-blue-500 marker:font-bold">
          {listItems.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // 6. Empty line
    if (!line) {
      elements.push(<div key={i} className="h-2" />);
      i++;
      continue;
    }

    // 7. Regular paragraph
    elements.push(
      <p key={i} className="text-slate-800 text-xs sm:text-sm leading-relaxed mb-2">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <div className={`space-y-1 ${className}`}>{elements}</div>;
};
