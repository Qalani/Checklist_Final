'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Components } from 'react-markdown';

const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'u'],
  attributes: {
    ...defaultSchema.attributes,
    u: [],
  },
} satisfies Parameters<typeof rehypeSanitize>[0];

const components: Components = {
  p: ({ node, ...props }) => (
    <p className="text-sm text-zen-600 leading-relaxed mb-2 last:mb-0" {...props} />
  ),
  strong: ({ node, ...props }) => <strong className="font-semibold text-zen-700" {...props} />,
  em: ({ node, ...props }) => <em className="italic" {...props} />,
  u: ({ node, ...props }) => <u className="underline" {...props} />,
  ul: ({ node, ...props }) => (
    <ul className="list-disc pl-5 text-sm text-zen-600 space-y-1 mb-2 last:mb-0" {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol className="list-decimal pl-5 text-sm text-zen-600 space-y-1 mb-2 last:mb-0" {...props} />
  ),
  li: ({ node, ...props }) => <li className="marker:text-zen-500" {...props} />,
};

interface MarkdownDisplayProps {
  text: string;
  className?: string;
}

export default function MarkdownDisplay({ text, className = '' }: MarkdownDisplayProps) {
  if (!text?.trim()) {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, schema],
        ]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
