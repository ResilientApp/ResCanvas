import React from 'react';
import { Link as RouterLink } from 'react-router-dom';

const RouterLinkWrapper = React.forwardRef(function RouterLinkWrapper(props, ref) {
  const { ownerState, sx, ...rest } = props || {};
  return <RouterLink ref={ref} {...rest} />;
});

export default RouterLinkWrapper;
