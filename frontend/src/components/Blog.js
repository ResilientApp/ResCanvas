import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { materialOceanic } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Box, Typography, Divider, IconButton, Tooltip, CircularProgress } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { CopyToClipboard } from 'react-copy-to-clipboard';

function Blog() {
  const [copied, setCopied] = useState(false);
  const [readmeContent, setReadmeContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('./BLOG.md')
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to load README.md');
        }
        return response.text();
      })
      .then(text => {
        setReadmeContent(text);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading README:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f9f9f9',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f9f9f9',
        }}
      >
        <Typography variant="h6" color="error">
          Error loading README: {error}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        backgroundColor: '#f9f9f9',
        paddingLeft: '2rem',
        paddingRight: '2rem',
        paddingTop: '1rem',
        paddingBottom: '1rem',
        boxSizing: 'border-box',
      }}
    >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            h1: ({ node, ...props }) => {
              const { ownerState, sx, className, ...rest } = props || {};
              return (
                <Typography
                  variant="h3"
                  {...rest}
                  sx={{
                    fontFamily: 'Comic Sans MS, cursive',
                    fontSize: '2rem',
                    fontWeight: 'bold',
                    color: '#1976d2',
                    paddingBottom: '0.5rem',
                    borderBottom: '2px solid #1976d2',
                  }}
                />
              );
            },
            h2: ({ node, ...props }) => {
              const { ownerState, sx, className, ...rest } = props || {};
              return (
                <Typography
                  variant="h4"
                  {...rest}
                  sx={{
                    fontFamily: 'Comic Sans MS, cursive',
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    color: '#333',
                    marginTop: '1.5rem',
                    marginBottom: '0.75rem',
                  }}
                />
              );
            },
            h3: ({ node, ...props }) => {
              const { ownerState, sx, className, ...rest } = props || {};
              return (
                <Typography
                  variant="h5"
                  {...rest}
                  sx={{
                    fontFamily: 'Comic Sans MS, cursive',
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                    color: '#333',
                    marginTop: '1.25rem',
                    marginBottom: '0.5rem',
                  }}
                />
              );
            },
            ul: ({ node, ...props }) => {
              const { ownerState, sx, className, ...rest } = props || {};
              return (
                <Box
                  component="ul"
                  {...rest}
                  sx={{
                    paddingLeft: '1.5rem',
                    margin: '0.75rem 0',
                    listStyleType: 'disc',
                    color: '#555',
                    fontFamily: 'Comic Sans MS, cursive',
                  }}
                />
              );
            },
            li: ({ node, ...props }) => {
              const { ownerState, sx, className, ...rest } = props || {};
              return (
                <Box
                  component="li"
                  {...rest}
                  sx={{
                    fontSize: '0.95rem',
                    lineHeight: '1.6',
                    marginBottom: '0.35rem',
                    fontFamily: 'Comic Sans MS, cursive',
                  }}
                />
              );
            },
            p: ({ node, ...props }) => {
              const { ownerState, sx, className, ...rest } = props || {};
              return (
                <p
                  style={{
                    fontFamily: 'Comic Sans MS, cursive',
                    fontSize: '0.95rem',
                    lineHeight: '1.7',
                    color: '#555',
                    marginBottom: '0.75rem',
                    marginTop: 0,
                  }}
                  {...rest}
                />
              );
            },
            code: ({ node, inline, className, children, ...props }) => {
              const { ownerState, sx, className: cls, ...restProps } = props || {};
              const match = /language-(\w+)/.exec(className || '');
              const codeContent = String(children).replace(/\n$/, '');

              // Check if this is truly inline code (single backticks in markdown)
              const isInline = inline === true || (!className && !codeContent.includes('\n'));

              const backgroundColor = '#1e1e1e';
              const textColor = '#ffffff';

              return !isInline ? (
                <Box
                  sx={{
                    position: 'relative',
                    borderRadius: '8px',
                    backgroundColor: backgroundColor,
                    padding: '0.75rem',
                    marginBottom: '1rem',
                    marginTop: '0.5rem',
                    boxSizing: 'border-box',
                    width: '100%',
                    maxWidth: '100%'
                  }}
                >
                  <CopyToClipboard
                    text={codeContent}
                    onCopy={() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    <Tooltip title={copied ? 'Copied!' : 'Copy'}>
                      <IconButton
                        sx={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          padding: 0,
                          width: '20px',
                          height: '20px',
                          color: textColor,
                        }}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </CopyToClipboard>
                  <SyntaxHighlighter
                    language={match?.[1] || 'plaintext'}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      background: 'transparent',
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      lineHeight: '1.4',
                      color: textColor,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                    }}
                    style={materialOceanic}
                    {...restProps}
                  >
                    {codeContent}
                  </SyntaxHighlighter>
                </Box>
              ) : (
                <code
                  style={{
                    backgroundColor: '#f4f4f4',
                    color: '#c7254e',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontFamily: 'monospace',
                    fontSize: '0.9em',
                  }}
                  {...restProps}
                >
                  {children}
                </code>
              );
            },

            hr: ({ node, ...props }) => {
              const { ownerState, sx, className, ...rest } = props || {};
              return (
                <Divider
                  {...rest}
                  sx={{
                    margin: '1.5rem 0',
                  }}
                />
              );
            },
            img: ({ node, ...props }) => {
              const { ownerState, sx, className, ...rest } = props || {};
              return (
                <Box
                  component="img"
                  sx={{
                    maxWidth: '100%',
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                    margin: '1rem auto',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                    borderRadius: '6px',
                  }}
                  {...rest}
                />
              );
            },
          }}
        >
          {readmeContent}
        </ReactMarkdown>
    </Box>
  );
}

export default Blog;