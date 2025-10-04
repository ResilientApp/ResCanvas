import React from 'react';
import { Link as RouterLink } from 'react-router-dom';

// RouterLink wrapped to strip MUI-specific props (like ownerState) that
// would otherwise be forwarded to the DOM and cause console warnings.
// Use forwardRef so MUI's ButtonBase can attach refs to this component.
const RouterLinkWrapper = React.forwardRef(function RouterLinkWrapper(props, ref) {
  const { ownerState, sx, ...rest } = props || {};
  return <RouterLink ref={ref} {...rest} />;
});

export default RouterLinkWrapper;
