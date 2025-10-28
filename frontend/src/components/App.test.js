import { render } from '@testing-library/react';
import App from './App';

test('renders App component without crashing', () => {
  const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  };
  global.localStorage = localStorageMock;

  const { container } = render(<App />);
  expect(container).toBeInTheDocument();
});
