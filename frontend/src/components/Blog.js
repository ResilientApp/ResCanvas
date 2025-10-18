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
    fetch('/README.md')
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

  // Ensure page-level horizontal overflow is hidden while this component is mounted
  useEffect(() => {
    const prevHtmlOverflowX = document.documentElement.style.overflowX;
    const prevBodyOverflowX = document.body.style.overflowX;
    const prevBodyMarginRight = document.body.style.marginRight;
    document.documentElement.style.overflowX = 'hidden';
    document.body.style.overflowX = 'hidden';
    // ensure no body margin that could shift scrollbar
    document.body.style.marginRight = '0';
    return () => {
      document.documentElement.style.overflowX = prevHtmlOverflowX;
      document.body.style.overflowX = prevBodyOverflowX;
      document.body.style.marginRight = prevBodyMarginRight;
    };
  }, []);

  // Compute header/footer heights at runtime and set container offsets so content isn't overlapped
  const [offsets, setOffsets] = React.useState({ top: null, bottom: null });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const headerSelectors = ['header', '[data-app-header]', '.app-header', '.MuiAppBar-root', '.MuiPaper-root'];
    const footerSelectors = ['footer', '[data-app-footer]', '.app-footer', '.app-footer-root'];

    function findEl(selectors, type = 'footer') {
      // try provided selectors first
      for (const s of selectors) {
        const el = document.querySelector(s);
        if (el) return el;
      }
      // try by class name containing 'footer' or 'header'
      const keyword = type === 'header' ? 'header' : 'footer';
      const byClass = Array.from(document.querySelectorAll('[class]')).find(el => {
        try {
          return el.className && String(el.className).toLowerCase().includes(keyword);
        } catch (e) {
          return false;
        }
      });
      if (byClass) return byClass;
      // try role attributes
      const role = type === 'header' ? '[role="banner"]' : '[role="contentinfo"]';
      const byRole = document.querySelector(role);
      if (byRole) return byRole;

      // final fallback: find an element tucked at the bottom of the viewport
      const candidates = Array.from(document.querySelectorAll('body *')).filter(el => {
        const r = el.getBoundingClientRect();
        // visible and non-zero size
        return r.width > 10 && r.height > 10 && r.bottom >= (window.innerHeight - 1);
      });
      if (candidates.length) {
        // pick the one with the greatest top (closest to bottom)
        candidates.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
        return candidates[0];
      }
      return null;
    }

    function compute() {
      const headerEl = findEl(headerSelectors, 'header');
      const footerEl = findEl(footerSelectors, 'footer');
      const top = headerEl ? Math.ceil(headerEl.getBoundingClientRect().height) : null;
      let bottom = null;
      if (footerEl) {
        // use the footer element's height so our container sits above it
        const fr = footerEl.getBoundingClientRect();
        bottom = Math.ceil(fr.height);
        // if footer is positioned above bottom (e.g., floating), ensure bottom includes distance from viewport bottom
        const distanceFromBottom = Math.max(0, Math.ceil(window.innerHeight - fr.bottom));
        bottom = bottom + distanceFromBottom;
      }
      // enforce a small minimum so container never touches the footer exactly
      const MIN_BOTTOM = 4;
      if (bottom != null) bottom = Math.max(bottom, MIN_BOTTOM);

      // account for iOS safe-area inset-bottom if present
      const safeAreaInset = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-bottom') || '0', 10) || 0;
      if (safeAreaInset > 0 && bottom != null) bottom += safeAreaInset;

      setOffsets({ top, bottom });
    }

    compute();
    const ro = new ResizeObserver(() => compute());
    // observe header/footer if present
    const headerEl = findEl(headerSelectors);
    const footerEl = findEl(footerSelectors);
    if (headerEl) ro.observe(headerEl);
    if (footerEl) ro.observe(footerEl);

    // MutationObserver to detect layout changes inside footer (class changes, child changes)
    const mo = new MutationObserver(() => compute());
    if (footerEl) mo.observe(footerEl, { attributes: true, childList: true, subtree: true });

    // Debounced resize handler (run compute immediately and once after resize stops)
    let resizeTimer = null;
    function onResize() {
      compute();
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        compute();
        resizeTimer = null;
      }, 200);
    }

    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      try { ro.disconnect(); } catch (e) { }
      try { mo.disconnect(); } catch (e) { }
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, []);

  if (loading) {
    return (
      <Box
        sx={{
          width: 'auto',
          height: 'calc(100vh - var(--app-header-height, 75px) - var(--app-footer-height, 150px))',
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
          width: 'auto',
          height: 'calc(100vh - var(--app-header-height, 75px) - var(--app-footer-height, 150px))',
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
        position: 'fixed',
        top: offsets.top != null ? `${offsets.top}px` : 'var(--app-header-height, 75px)',
        bottom: offsets.bottom != null ? `${offsets.bottom}px` : 'var(--app-footer-height, 10px)',
        left: 0,
        right: 0,
        boxSizing: 'border-box',
        backgroundColor: '#f9f9f9',
        overflowX: 'hidden',
        // keep layout stacking context
        zIndex: 1,
        ...(process.env.NODE_ENV === 'development' ? { outline: '2px dashed rgba(0,0,0,0.08)' } : {}),
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          boxSizing: 'border-box',
          paddingLeft: '2rem',
          paddingRight: '2rem',
          paddingTop: '1rem',
          paddingBottom: '1rem',
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          '&::-webkit-scrollbar': { width: '12px' },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': { backgroundColor: '#c1c1c1', borderRadius: '6px' },
          scrollbarWidth: 'auto',
          scrollbarColor: '#c1c1c1 transparent',
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            h1: ({ node, ...props }) => {
              const { ownerState, ...rest } = props || {};
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
              const { ownerState, ...rest } = props || {};
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
              const { ownerState, ...rest } = props || {};
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
              const { ownerState, ...rest } = props || {};
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
              const { ownerState, ...rest } = props || {};
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
              const { ownerState, ...rest } = props || {};
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
              const { ownerState, ...restProps } = props || {};
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
              const { ownerState, ...rest } = props || {};
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
              const { ownerState, ...rest } = props || {};
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
    </Box>
  );
}

export default Blog;