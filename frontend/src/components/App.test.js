import { render } from '@testing-library/react';
import App from './App';

test('renders App component without crashing', () => {
  // Mock localStorage for auth
  const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  };
  global.localStorage = localStorageMock;
  
  // Just test that the component renders without throwing
  const { container } = render(<App />);
  expect(container).toBeInTheDocument();
});
