import React from 'react';

export const Link = ({ children, to, ...rest }) => {
  return React.createElement('a', { href: typeof to === 'string' ? to : '#', ...rest }, children);
};

export const BrowserRouter = ({ children }) => React.createElement(React.Fragment, null, children);

export default {
  Link,
  BrowserRouter,
};
