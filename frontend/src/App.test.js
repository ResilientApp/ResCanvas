import React from 'react';
import { render } from '@testing-library/react';
import App from './App';
import { act } from 'react';

test('smoke: App renders without crashing', async () => {
  let container;
  await act(async () => {
    const res = render(<App />);
    container = res.container;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(container).toBeDefined();
});
