const React = require('react');

// Mock BrowserRouter
const BrowserRouter = ({ children }) => React.createElement('div', null, children);

// Mock Link
const Link = ({ children, to, ...props }) => React.createElement('a', { href: to, ...props }, children);

// Mock Navigate
const Navigate = ({ to }) => null;

// Mock useNavigate
const useNavigate = () => jest.fn();

// Mock useParams
const useParams = () => ({});

// Mock useLocation
const useLocation = () => ({
  pathname: '/',
  search: '',
  hash: '',
  state: null,
});

// Mock useHistory (for compatibility)
const useHistory = () => ({
  push: jest.fn(),
  replace: jest.fn(),
  goBack: jest.fn(),
});

// Mock Routes and Route
const Routes = ({ children }) => React.createElement('div', null, children);
const Route = () => null;

module.exports = {
  BrowserRouter,
  Link,
  Navigate,
  useNavigate,
  useParams,
  useLocation,
  useHistory,
  Routes,
  Route,
};
