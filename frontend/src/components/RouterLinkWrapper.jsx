import React from 'react';
import { Link as RouterLink } from 'react-router-dom';

// RouterLink wrapped to strip MUI-specific props (like ownerState) that
// would otherwise be forwarded to the DOM and cause console warnings.
const RouterLinkWrapper = React.forwardRef(function RouterLinkWrapper(props, ref) {
  const { ownerState, sx, ...rest } = props || {};
  return <RouterLink ref={ref} {...rest} />;
});

export default RouterLinkWrapper;
