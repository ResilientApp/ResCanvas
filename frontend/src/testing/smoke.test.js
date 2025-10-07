import React from 'react';
import { render } from '@testing-library/react';
import App from '../App';

test('smoke: App renders without crashing', () => {
  const { container } = render(<App />);
  expect(container).toBeDefined();
});
