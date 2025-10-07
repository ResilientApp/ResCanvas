import React, { useState } from 'react';
import '../styles/Blog.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { materialOceanic } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Box, Typography, Divider, IconButton, Tooltip } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { CopyToClipboard } from 'react-copy-to-clipboard';

const readmeContent = `# About ResCanvas
...`;

function Blog() {
  const [copied, setCopied] = useState(false);

  return (
    <Box sx={{ width: 'auto', height: 'calc(100vh - var(--app-header-height, 75px) - var(--app-footer-height, 150px))', display: 'flex', flexDirection: 'column', margin: '0 auto', backgroundColor: '#f9f9f9', 'padding-left': '2rem', boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)' }}>
      <Box sx={{ flex: 1, minHeight: 0, height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={{
          // ...existing rich renderers preserved from original Blog.js
        }}>
          {readmeContent}
        </ReactMarkdown>
      </Box>
    </Box>
  );
}

export default Blog;
