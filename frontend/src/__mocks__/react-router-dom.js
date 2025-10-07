import React from 'react';

// Forwarding ref so components like MUI ButtonBase can attach refs to the link
export const Link = React.forwardRef(({ children, to, ...rest }, ref) => {
  return React.createElement('a', { ref, href: typeof to === 'string' ? to : '#', ...rest }, children);
});

export const BrowserRouter = ({ children }) => React.createElement(React.Fragment, null, children);

export default {
  Link,
  BrowserRouter,
};
